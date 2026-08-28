'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const multer = require('multer');
const sharp = require('sharp');

const MAX_WORK_IMAGE_SIZE = 8 * 1024 * 1024;
const MAX_WORK_IMAGES_PER_REQUEST = 10;
const WORK_IMAGE_MAX_SIDE = 2000;
const WORK_UPLOAD_DIR = path.join(__dirname, '..', 'site', 'uploads', 'works');
const WORK_UPLOAD_URL_PREFIX = '/site/uploads/works/';
const ALLOWED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const workImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_WORK_IMAGE_SIZE,
    files: MAX_WORK_IMAGES_PER_REQUEST,
    fields: 1,
    parts: MAX_WORK_IMAGES_PER_REQUEST + 1,
    fieldNameSize: 32,
    fieldSize: 32,
    fieldNestingDepth: 1,
  },
  fileFilter(req, file, callback) {
    if (!ALLOWED_IMAGE_MIMES.has(String(file.mimetype || '').toLowerCase())) {
      const error = new Error('Допустимы только JPEG, PNG и WebP.');
      error.status = 400;
      return callback(error);
    }
    return callback(null, true);
  },
}).array('images', MAX_WORK_IMAGES_PER_REQUEST);

async function saveWorkImage(buffer) {
  await fs.mkdir(WORK_UPLOAD_DIR, { recursive: true });
  const filename = `${Date.now()}-${crypto.randomUUID().replaceAll('-', '')}.webp`;
  const absolutePath = path.join(WORK_UPLOAD_DIR, filename);
  const options = { failOn: 'error', limitInputPixels: 48_000_000 };
  const metadata = await sharp(buffer, options).metadata();

  if (!['jpeg', 'png', 'webp'].includes(String(metadata.format || ''))) {
    const error = new Error('Файл не является поддерживаемым изображением.');
    error.status = 400;
    throw error;
  }

  await sharp(buffer, options)
    .rotate()
    .resize({
      width: WORK_IMAGE_MAX_SIDE,
      height: WORK_IMAGE_MAX_SIDE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 84, effort: 4 })
    .toFile(absolutePath);

  return `${WORK_UPLOAD_URL_PREFIX}${filename}`;
}

function getManagedAbsolutePath(imagePath) {
  const normalized = String(imagePath || '').trim().replaceAll('\\', '/');
  if (!normalized.startsWith(WORK_UPLOAD_URL_PREFIX)) return null;
  const filename = normalized.slice(WORK_UPLOAD_URL_PREFIX.length);
  if (!filename || filename.includes('/') || filename.includes('..') || path.basename(filename) !== filename) return null;
  return path.join(WORK_UPLOAD_DIR, filename);
}

async function removeManagedWorkImage(imagePath) {
  const absolutePath = getManagedAbsolutePath(imagePath);
  if (!absolutePath) return false;
  try {
    await fs.unlink(absolutePath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

module.exports = {
  MAX_WORK_IMAGES_PER_REQUEST,
  workImageUpload,
  saveWorkImage,
  removeManagedWorkImage,
};
