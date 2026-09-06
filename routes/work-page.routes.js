'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const express = require('express');
const prisma = require('../lib/prisma');
const site = require('../config/site');

const router = express.Router();
const workTemplatePath = path.join(__dirname, '..', 'public', 'work.html');
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (symbol) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  })[symbol]);
}

function serializeJsonForHtml(value) {
  return JSON.stringify(value)
    .replace(/&/g, '\\u0026')
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function renderGalleryThumbnails(images, title) {
  return images.map((image, index) => {
    const alt = image.alt || `${title} — фото ${index + 1}`;
    const current = index === 0 ? ' aria-current="true"' : '';
    const loading = index === 0 ? 'eager' : 'lazy';

    return `<div class="work-gallery__thumb-item" role="listitem"><button class="work-gallery__thumb${index === 0 ? ' is-active' : ''}" type="button" data-gallery-thumb data-index="${index}" data-src="${escapeHtml(image.imagePath)}" data-alt="${escapeHtml(alt)}" aria-label="Показать фото ${index + 1} из ${images.length}"${current}>
      <img src="${escapeHtml(image.imagePath)}" alt="" loading="${loading}" decoding="async">
    </button></div>`;
  }).join('');
}

function renderWorkTemplate(template, values) {
  return template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (placeholder, key) => {
    if (!Object.prototype.hasOwnProperty.call(values, key)) {
      throw new Error(`Не задано значение шаблона work.html: ${key}`);
    }
    return values[key];
  });
}

router.get('/:slug', async (req, res, next) => {
  try {
    const slug = String(req.params.slug || '').trim();
    if (!SLUG_PATTERN.test(slug)) return next();

    const work = await prisma.work.findFirst({
      where: { slug, isPublished: true, images: { some: { kind: 'COVER' } } },
      include: {
        images: {
          orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }],
        },
      },
    });
    if (!work) return next();

    const cover = work.images.find((image) => image.kind === 'COVER');
    const gallery = work.images.filter((image) => image.kind === 'GALLERY');
    const images = [cover, ...gallery];
    const canonical = `${site.origin}/works/${encodeURIComponent(work.slug)}`;
    const seoTitle = work.seoTitle || `${work.title} — CarLife`;
    const seoDescription = work.seoDescription
      || work.shortDescription
      || `${work.service} для ${work.car} в автосервисе CarLife в Абакане.`;
    const ogImage = `${site.origin}${cover.imagePath}`;
    const jsonLd = serializeJsonForHtml({
      '@context': 'https://schema.org',
      '@type': 'Service',
      name: seoTitle,
      description: seoDescription,
      url: canonical,
      image: images.map((image) => `${site.origin}${image.imagePath}`),
      areaServed: work.location || site.city,
      provider: {
        '@type': 'AutoRepair',
        name: site.brand,
        telephone: site.phone,
      },
    });
    const template = await fs.readFile(workTemplatePath, 'utf8');
    const html = renderWorkTemplate(template, {
      SEO_TITLE: escapeHtml(seoTitle),
      SEO_DESCRIPTION: escapeHtml(seoDescription),
      CANONICAL: escapeHtml(canonical),
      OG_IMAGE: escapeHtml(ogImage),
      CSP_NONCE: escapeHtml(res.locals.cspNonce),
      JSON_LD: jsonLd,
      PHONE: escapeHtml(site.phone),
      PHONE_DISPLAY: escapeHtml(site.phoneDisplay),
      ADDRESS: escapeHtml(site.address),
      SERVICE: escapeHtml(work.service),
      LOCATION: escapeHtml(work.location || site.city),
      WORK_TITLE: escapeHtml(work.title),
      SHORT_DESCRIPTION: escapeHtml(work.shortDescription || work.car),
      CAR: escapeHtml(work.car),
      DURATION: escapeHtml(work.durationText || 'Срок по согласованию'),
      DESCRIPTION: escapeHtml(
        work.description
          || work.shortDescription
          || 'Провели диагностику и выполнили необходимые работы с автомобилем.',
      ),
      MAIN_IMAGE_SRC: escapeHtml(cover.imagePath),
      MAIN_IMAGE_ALT: escapeHtml(cover.alt || work.title),
      GALLERY_COUNT: String(images.length),
      GALLERY_MODIFIER: images.length === 1 ? 'work-gallery--single' : '',
      GALLERY_THUMBNAILS: renderGalleryThumbnails(images, work.title),
    });

    res.set('Cache-Control', 'no-store, max-age=0');
    return res.status(200).type('html').send(html);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
