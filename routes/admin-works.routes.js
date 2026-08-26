'use strict';

const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { loadAdminSession, requireAdminAuth, requireAdminCsrf } = require('../middleware/auth');
const {
  workImageUpload,
  saveWorkImage,
  removeManagedWorkImage,
  MAX_WORK_IMAGES_PER_REQUEST,
} = require('../lib/upload');

const router = express.Router();
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const IMAGE_KINDS = ['COVER', 'GALLERY'];

const listQuerySchema = z.object({
  status: z.enum(['ALL', 'PUBLISHED', 'DRAFT']).optional().default('ALL'),
  q: z.string().trim().max(100).optional().default(''),
  page: z.coerce.number().int().min(1).max(500).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

const workPayloadSchema = z.object({
  title: z.string().trim().min(2).max(180),
  slug: z.string().trim().min(2).max(120).regex(SLUG_PATTERN),
  car: z.string().trim().min(2).max(160),
  service: z.string().trim().min(2).max(160),
  shortDescription: z.string().trim().max(500).optional().default(''),
  description: z.string().trim().max(10_000).optional().default(''),
  seoTitle: z.string().trim().max(180).optional().default(''),
  seoDescription: z.string().trim().max(320).optional().default(''),
  durationText: z.string().trim().max(120).optional().default(''),
  location: z.string().trim().min(2).max(120).optional().default('Абакан'),
  isPublished: z.boolean().optional().default(false),
  showOnHome: z.boolean().optional().default(false),
  sortOrder: z.number().int().min(0).max(1_000_000).optional().default(100),
}).strict();

function validateSameOrigin(req, res, next) {
  const origin = String(req.get('origin') || '').trim();
  if (!origin) return next();
  try {
    const ownOrigin = new URL(`${req.protocol}://${req.get('host') || ''}`).origin;
    if (new URL(origin).origin !== ownOrigin) {
      return res.status(403).json({ message: 'Источник запроса не разрешён.' });
    }
  } catch {
    return res.status(403).json({ message: 'Источник запроса не разрешён.' });
  }
  return next();
}

function parsePositiveId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function mapWork(work) {
  return {
    ...work,
    createdAt: work.createdAt.toISOString(),
    updatedAt: work.updatedAt.toISOString(),
    images: (work.images || []).map((image) => ({
      ...image,
      createdAt: image.createdAt.toISOString(),
      updatedAt: image.updatedAt.toISOString(),
    })),
  };
}

function getWork(id) {
  return prisma.work.findUnique({
    where: { id },
    include: { images: { orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }] } },
  });
}

router.use(loadAdminSession, requireAdminAuth);

router.get('/', async (req, res, next) => {
  try {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ message: 'Проверьте параметры списка.' });
    const { status, q, page, limit } = parsed.data;
    const where = {};
    if (status === 'PUBLISHED') where.isPublished = true;
    if (status === 'DRAFT') where.isPublished = false;
    if (q) where.OR = [
      { title: { contains: q } },
      { car: { contains: q } },
      { service: { contains: q } },
      { slug: { contains: q } },
    ];

    const [total, items] = await Promise.all([
      prisma.work.count({ where }),
      prisma.work.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
        include: { images: { where: { kind: 'COVER' }, orderBy: { id: 'asc' } } },
      }),
    ]);
    return res.json({
      items: items.map(mapWork),
      pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = parsePositiveId(req.params.id);
    if (!id) return res.status(400).json({ message: 'Некорректный ID.' });
    const work = await getWork(id);
    if (!work) return res.status(404).json({ message: 'Работа не найдена.' });
    return res.json({ item: mapWork(work) });
  } catch (error) {
    return next(error);
  }
});

router.post('/', validateSameOrigin, requireAdminCsrf, async (req, res, next) => {
  try {
    const parsed = workPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues?.[0]?.message || 'Проверьте данные работы.' });
    }
    if (parsed.data.isPublished || parsed.data.showOnHome) {
      return res.status(400).json({ message: 'Сначала сохраните работу и загрузите обложку.' });
    }
    const work = await prisma.work.create({ data: parsed.data });
    return res.status(201).json({ ok: true, item: mapWork({ ...work, images: [] }) });
  } catch (error) {
    if (error?.code === 'P2002') return res.status(409).json({ message: 'Такой slug уже используется.' });
    return next(error);
  }
});

router.patch('/:id', validateSameOrigin, requireAdminCsrf, async (req, res, next) => {
  try {
    const id = parsePositiveId(req.params.id);
    if (!id) return res.status(400).json({ message: 'Некорректный ID.' });
    const parsed = workPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues?.[0]?.message || 'Проверьте данные работы.' });
    }
    if (parsed.data.isPublished) {
      const cover = await prisma.workImage.findFirst({ where: { workId: id, kind: 'COVER' } });
      if (!cover) return res.status(400).json({ message: 'Для публикации загрузите обложку работы.' });
    }
    if (parsed.data.showOnHome && !parsed.data.isPublished) {
      return res.status(400).json({ message: 'На главной можно показывать только опубликованную работу.' });
    }
    await prisma.work.update({ where: { id }, data: parsed.data });
    return res.json({ ok: true, item: mapWork(await getWork(id)) });
  } catch (error) {
    if (error?.code === 'P2025') return res.status(404).json({ message: 'Работа не найдена.' });
    if (error?.code === 'P2002') return res.status(409).json({ message: 'Такой slug уже используется.' });
    return next(error);
  }
});

router.post(
  '/:id/images',
  validateSameOrigin,
  requireAdminCsrf,
  (req, res, next) => workImageUpload(req, res, (error) => {
    if (!error) return next();
    error.status = Number(error.status) || 400;
    return next(error);
  }),
  async (req, res, next) => {
    const savedPaths = [];
    try {
      const id = parsePositiveId(req.params.id);
      const kind = String(req.body.kind || '').toUpperCase();
      if (!id) return res.status(400).json({ message: 'Некорректный ID.' });
      if (!IMAGE_KINDS.includes(kind)) return res.status(400).json({ message: 'Некорректный тип фотографии.' });
      const work = await prisma.work.findUnique({ where: { id } });
      if (!work) return res.status(404).json({ message: 'Работа не найдена.' });
      const files = Array.isArray(req.files) ? req.files : [];
      if (!files.length) return res.status(400).json({ message: 'Выберите фотографии.' });
      if (kind === 'COVER' && files.length !== 1) return res.status(400).json({ message: 'Для обложки выберите один файл.' });
      if (kind === 'GALLERY') {
        const count = await prisma.workImage.count({ where: { workId: id, kind: 'GALLERY' } });
        if (count + files.length > 12) return res.status(400).json({ message: 'В галерее может быть максимум 12 фото.' });
      }
      for (const file of files.slice(0, MAX_WORK_IMAGES_PER_REQUEST)) {
        savedPaths.push(await saveWorkImage(file.buffer));
      }
      const oldImages = kind === 'COVER'
        ? await prisma.workImage.findMany({ where: { workId: id, kind: 'COVER' } })
        : [];
      await prisma.$transaction(async (tx) => {
        if (kind === 'COVER') await tx.workImage.deleteMany({ where: { workId: id, kind: 'COVER' } });
        const baseOrder = kind === 'GALLERY'
          ? 100 + await tx.workImage.count({ where: { workId: id, kind: 'GALLERY' } })
          : 0;
        for (const [index, imagePath] of savedPaths.entries()) {
          await tx.workImage.create({
            data: {
              workId: id,
              kind,
              imagePath,
              alt: kind === 'COVER' ? `${work.title} — обложка` : `${work.title} — фото работы`,
              sortOrder: baseOrder + index,
            },
          });
        }
      });
      await Promise.allSettled(oldImages.map((image) => removeManagedWorkImage(image.imagePath)));
      return res.status(201).json({ ok: true, item: mapWork(await getWork(id)) });
    } catch (error) {
      await Promise.allSettled(savedPaths.map(removeManagedWorkImage));
      return next(error);
    }
  },
);

router.delete('/:id/images/:imageId', validateSameOrigin, requireAdminCsrf, async (req, res, next) => {
  try {
    const workId = parsePositiveId(req.params.id);
    const imageId = parsePositiveId(req.params.imageId);
    if (!workId || !imageId) return res.status(400).json({ message: 'Некорректный ID.' });
    const image = await prisma.workImage.findFirst({ where: { id: imageId, workId } });
    if (!image) return res.status(404).json({ message: 'Фото не найдено.' });
    if (image.kind === 'COVER') {
      const work = await prisma.work.findUnique({ where: { id: workId }, select: { isPublished: true } });
      if (work?.isPublished) {
        return res.status(400).json({ message: 'Сначала снимите работу с публикации, затем удалите обложку.' });
      }
    }
    await prisma.workImage.delete({ where: { id: imageId } });
    await removeManagedWorkImage(image.imagePath);
    return res.json({ ok: true, item: mapWork(await getWork(workId)) });
  } catch (error) {
    return next(error);
  }
});

router.delete('/:id', validateSameOrigin, requireAdminCsrf, async (req, res, next) => {
  try {
    const id = parsePositiveId(req.params.id);
    if (!id) return res.status(400).json({ message: 'Некорректный ID.' });
    const work = await getWork(id);
    if (!work) return res.status(404).json({ message: 'Работа не найдена.' });
    await prisma.work.delete({ where: { id } });
    await Promise.allSettled(work.images.map((image) => removeManagedWorkImage(image.imagePath)));
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
