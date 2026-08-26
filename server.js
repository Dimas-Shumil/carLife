'use strict';

require('dotenv').config();

const path = require('node:path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const prisma = require('./lib/prisma');
const site = require('./config/site');
const apiRouter = require('./routes/api.routes');
const publicRouter = require('./routes/public.routes');
const authRouter = require('./routes/auth.routes');
const adminRouter = require('./routes/admin.routes');
const adminApiRouter = require('./routes/admin-api.routes');
const adminWorksRouter = require('./routes/admin-works.routes');
const workPageRouter = require('./routes/work-page.routes');
const { verifyMailConnection } = require('./services/mail.service');
const { notFoundHandler, errorHandler } = require('./middleware/error-handler');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';
const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  process.env.SITE_ORIGIN,
  'https://carlife-abakan.ru',
  'https://www.carlife-abakan.ru',
].filter(Boolean);

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
      imgSrc: ["'self'", 'data:', 'https:'],
      fontSrc: ["'self'", 'data:'],
      frameSrc: ['https://yandex.ru'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'same-site' },
}));

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('CORS blocked'));
  },
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
  credentials: true,
}));

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: isProduction ? '1h' : 0,
  etag: true,
}));
app.use('/site', express.static(path.join(__dirname, 'site'), {
  maxAge: isProduction ? '7d' : 0,
  etag: true,
}));

async function healthHandler(req, res, next) {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return res.json({ success: true, service: 'carlife', database: 'ok' });
  } catch (error) {
    return next(error);
  }
}

app.get(['/health', '/api/health'], healthHandler);
app.get('/robots.txt', (req, res) => res.type('text/plain').sendFile(path.join(__dirname, 'robots.txt')));
app.get('/sitemap.xml', async (req, res, next) => {
  try {
    const works = await prisma.work.findMany({
      where: { isPublished: true, images: { some: { kind: 'COVER' } } },
      select: { slug: true, updatedAt: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
    const staticUrls = ['/', '/works', '/privacy-policy'];
    const entries = [
      ...staticUrls.map((pathname) => `<url><loc>${site.origin}${pathname}</loc></url>`),
      ...works.map((work) => `<url><loc>${site.origin}/works/${encodeURIComponent(work.slug)}</loc><lastmod>${work.updatedAt.toISOString()}</lastmod></url>`),
    ];
    res.type('application/xml');
    return res.send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.join('')}</urlset>`);
  } catch (error) {
    return next(error);
  }
});

app.use('/api/admin/auth', authRouter);
app.use('/api/admin/works', adminWorksRouter);
app.use('/api/admin', adminApiRouter);
app.use('/api', apiRouter);
app.use('/api', publicRouter);
app.use('/admin', adminRouter);
app.use('/works', workPageRouter);

const sendPublic = (res, fileName) => res.sendFile(path.join(__dirname, 'public', fileName));
app.get('/', (req, res) => sendPublic(res, 'index.html'));
app.get(['/works', '/works.html'], (req, res) => sendPublic(res, 'works.html'));
app.get(['/privacy-policy', '/privacy-policy.html'], (req, res) => sendPublic(res, 'privacy-policy.html'));

app.use(notFoundHandler);
app.use(errorHandler);

const server = app.listen(PORT, () => {
  console.log(`CarLife server started: http://localhost:${PORT}`);
  void verifyMailConnection().then((status) => {
    if (!status.configured) console.log('SMTP не настроен — заявки сохраняются только в базе');
    else if (status.ready) console.log('SMTP готов к отправке писем');
    else console.error(`SMTP недоступен: ${status.error?.message || status.error}`);
  });
});

async function shutdown(signal) {
  console.log(`${signal}: stopping CarLife`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

module.exports = app;
