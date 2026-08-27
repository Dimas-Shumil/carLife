'use strict';

require('dotenv').config();

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
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
const HOST = process.env.HOST || '127.0.0.1';
const isProduction = process.env.NODE_ENV === 'production';
const publicDir = path.join(__dirname, 'public');
const siteDir = path.join(__dirname, 'site');

function normalizeOrigin(value) {
  try {
    return new URL(String(value || '').trim()).origin;
  } catch {
    return '';
  }
}

const allowedOrigins = new Set([
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  process.env.SITE_ORIGIN,
  'https://carlife-abakan.ru',
  'https://www.carlife-abakan.ru',
].map(normalizeOrigin).filter(Boolean));

app.disable('x-powered-by');
app.set('trust proxy', isProduction ? 'loopback' : false);

app.use((req, res, next) => {
  res.locals.cspNonce = crypto.randomBytes(18).toString('base64');
  res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  next();
});

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        'https://cdn.jsdelivr.net',
        (req, res) => `'nonce-${res.locals.cspNonce}'`,
      ],
      scriptSrcAttr: ["'none'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
      imgSrc: ["'self'", 'data:'],
      fontSrc: ["'self'", 'data:'],
      frameSrc: ['https://yandex.ru'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: isProduction ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'same-origin' },
}));

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(normalizeOrigin(origin))) return callback(null, true);
    const error = new Error('Источник запроса не разрешен.');
    error.status = 403;
    return callback(error);
  },
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
  credentials: true,
}));

app.use(express.json({ limit: '100kb', strict: true }));

function setStaticHeaders(res, filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.html') {
    res.set('Cache-Control', 'no-store, max-age=0');
    return;
  }
  if (extension === '.css' || extension === '.js') {
    res.set('Cache-Control', 'no-cache');
    return;
  }
  res.set('Cache-Control', isProduction ? 'public, max-age=604800, immutable' : 'no-cache');
}

const staticOptions = {
  dotfiles: 'deny',
  etag: true,
  fallthrough: true,
  index: false,
  setHeaders: setStaticHeaders,
};

for (const directory of ['css', 'fonts', 'img', 'js', 'script']) {
  app.use(`/site/${directory}`, express.static(path.join(siteDir, directory), staticOptions));
}
app.use('/site/uploads/works', express.static(path.join(siteDir, 'uploads', 'works'), staticOptions));

async function sendPublic(res, fileName, injectNonce = false) {
  res.set({
    'Cache-Control': 'no-store, max-age=0',
    Pragma: 'no-cache',
    Expires: '0',
  });

  if (!injectNonce) return res.sendFile(path.join(publicDir, fileName));

  const html = await fs.readFile(path.join(publicDir, fileName), 'utf8');
  return res.type('html').send(html.replaceAll('{{CSP_NONCE}}', res.locals.cspNonce));
}

async function healthHandler(req, res, next) {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return res.json({ success: true, service: 'carlife', database: 'ok' });
  } catch (error) {
    return next(error);
  }
}

app.get(['/health', '/api/health'], healthHandler);
app.get('/robots.txt', (req, res) => {
  res.set('Cache-Control', 'no-cache');
  return res.type('text/plain').sendFile(path.join(__dirname, 'robots.txt'));
});
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
    res.set('Cache-Control', 'no-cache');
    res.type('application/xml');
    return res.send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.join('')}</urlset>`);
  } catch (error) {
    return next(error);
  }
});

app.use('/api/admin', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
app.use('/api/admin/auth', authRouter);
app.use('/api/admin/works', adminWorksRouter);
app.use('/api/admin', adminApiRouter);
app.use('/api', apiRouter);
app.use('/api', publicRouter);
app.use('/admin', adminRouter);
app.use('/works', workPageRouter);

app.get('/index.html', async (req, res, next) => {
  try {
    return await sendPublic(res, 'index.html', true);
  } catch (error) {
    return next(error);
  }
});
app.get('/', async (req, res, next) => {
  try {
    return await sendPublic(res, 'index.html', true);
  } catch (error) {
    return next(error);
  }
});
app.get(['/works', '/works.html'], async (req, res, next) => {
  try {
    return await sendPublic(res, 'works.html');
  } catch (error) {
    return next(error);
  }
});
app.get(['/privacy-policy', '/privacy-policy.html'], async (req, res, next) => {
  try {
    return await sendPublic(res, 'privacy-policy.html');
  } catch (error) {
    return next(error);
  }
});

app.use(notFoundHandler);
app.use(errorHandler);

let server;

function startServer() {
  server = app.listen(PORT, HOST, () => {
    console.log(`CarLife server started: http://${HOST}:${PORT}`);
    void verifyMailConnection().then((status) => {
      if (!status.configured) console.log('SMTP не настроен — заявки сохраняются только в базе');
      else if (status.ready) console.log('SMTP готов к отправке писем');
      else console.error(`SMTP недоступен: ${status.error?.message || status.error}`);
    });
  });
  return server;
}

async function shutdown(signal) {
  console.log(`${signal}: stopping CarLife`);
  if (!server) {
    await prisma.$disconnect();
    process.exit(0);
  }
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

if (require.main === module) {
  startServer();
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

module.exports = app;
