'use strict';

const express = require('express');
const prisma = require('../lib/prisma');
const site = require('../config/site');

const router = express.Router();

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (symbol) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  })[symbol]);
}

function renderGallery(images, title) {
  if (!images.length) return '';
  return `<section class="work-page__gallery" aria-labelledby="gallery-title">
    <div class="work-page__section-head"><span>Детали ремонта</span><h2 id="gallery-title">Галерея работы</h2></div>
    <div class="work-page__gallery-grid">${images.map((image) => `<figure><img src="${escapeHtml(image.imagePath)}" alt="${escapeHtml(image.alt || title)}" loading="lazy" decoding="async"></figure>`).join('')}</div>
  </section>`;
}

router.get('/:slug', async (req, res, next) => {
  try {
    const slug = String(req.params.slug || '').trim();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return next();
    const work = await prisma.work.findFirst({
      where: { slug, isPublished: true, images: { some: { kind: 'COVER' } } },
      include: { images: { orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }] } },
    });
    if (!work) return next();
    const cover = work.images.find((image) => image.kind === 'COVER');
    const gallery = work.images.filter((image) => image.kind === 'GALLERY');
    const canonical = `${site.origin}/works/${encodeURIComponent(work.slug)}`;
    const seoTitle = work.seoTitle || `${work.title} — CarLife`;
    const seoDescription = work.seoDescription || work.shortDescription || `${work.service} для ${work.car} в автосервисе CarLife в Абакане.`;
    const ogImage = `${site.origin}${cover.imagePath}`;
    const jsonLd = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Service',
      name: seoTitle,
      description: seoDescription,
      url: canonical,
      image: [ogImage, ...gallery.map((image) => `${site.origin}${image.imagePath}`)],
      areaServed: work.location || site.city,
      provider: { '@type': 'AutoRepair', name: site.brand, telephone: site.phone },
    }).replace(/</g, '\\u003c');
    res.set('Cache-Control', 'public, max-age=300');
    return res.status(200).send(`<!doctype html>
<html lang="ru"><head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="${escapeHtml(seoDescription)}"><meta name="robots" content="index,follow,max-image-preview:large">
  <meta property="og:type" content="article"><meta property="og:title" content="${escapeHtml(seoTitle)}">
  <meta property="og:description" content="${escapeHtml(seoDescription)}"><meta property="og:url" content="${escapeHtml(canonical)}">
  <meta property="og:image" content="${escapeHtml(ogImage)}"><meta name="twitter:card" content="summary_large_image">
  <link rel="canonical" href="${escapeHtml(canonical)}"><link rel="icon" href="/site/img/circle-logo.webp" type="image/webp">
  <link rel="stylesheet" href="/site/css/main.min.css"><link rel="stylesheet" href="/site/css/works.min.css">
  <title>${escapeHtml(seoTitle)}</title><script type="application/ld+json" nonce="${escapeHtml(res.locals.cspNonce)}">${jsonLd}</script>
</head><body>
  <header class="header"><div class="header__logo"><a href="/" aria-label="CarLife на главную"><img src="/site/img/logo.webp" alt="CarLife"></a></div><div class="header__overlay"></div><button class="header__burger" type="button" aria-label="Открыть меню" aria-expanded="false"><span></span><span></span><span></span></button><nav class="header__nav" aria-label="Основная навигация"><ul><li><a href="/#uslugi">УСЛУГИ</a></li><li><a href="/works">РАБОТЫ</a></li><li><a href="/#otzyv">ОТЗЫВЫ</a></li><li><a href="/#about">О НАС</a></li><li><a href="/#contacts">КОНТАКТЫ</a></li><li><a href="/#connect">ЗАПИСАТЬСЯ</a></li><li><a href="tel:${site.phone}">ПОЗВОНИТЬ</a></li></ul></nav></header>
  <main class="work-page">
    <section class="work-page__hero"><div class="work-page__hero-copy"><a class="work-page__back" href="/works">← Все работы</a><span class="work-page__kicker">${escapeHtml(work.service)} · ${escapeHtml(work.location)}</span><h1>${escapeHtml(work.title)}</h1><p>${escapeHtml(work.shortDescription || work.car)}</p><div class="work-page__meta"><span>${escapeHtml(work.car)}</span><span>${escapeHtml(work.durationText || 'Срок по согласованию')}</span><span>${escapeHtml(work.location)}</span></div></div><figure class="work-page__cover"><img src="${escapeHtml(cover.imagePath)}" alt="${escapeHtml(cover.alt || work.title)}"></figure></section>
    <section class="work-page__description"><div class="work-page__section-head"><span>Выполненная работа</span><h2>Что сделали</h2></div><p>${escapeHtml(work.description || work.shortDescription || 'Провели диагностику и выполнили необходимые работы с автомобилем.')}</p></section>
    ${renderGallery(gallery, work.title)}
    <section class="work-page__cta"><div><span>Нужен ремонт или диагностика?</span><h2>Запишитесь в CarLife</h2></div><a href="/#connect">Оставить заявку</a></section>
  </main>
  <nav class="floating-actions" data-floating-actions aria-label="Быстрые действия"><a class="floating-actions__button" href="/#connect" aria-label="Оставить заявку"><img src="/site/img/floating/request-icon.svg" alt="" width="30" height="30"></a><a class="floating-actions__button" href="tel:${site.phone}" aria-label="Позвонить"><img src="/site/img/floating/phone-icon.svg" alt="" width="30" height="30"></a></nav>
  <footer class="footer"><div class="footer__container"><div class="footer__top"><div class="footer__brand"><span class="footer__eyebrow">Автосервис в Абакане</span><div class="footer__logo">CAR LIFE</div><p class="footer__description">Диагностика, обслуживание и ремонт автомобилей.</p></div><div class="footer__info"><div class="footer__column"><span class="footer__label">Контакты</span><a class="footer__link footer__phone" href="tel:${site.phone}">${site.phoneDisplay}</a></div><div class="footer__column"><span class="footer__label">Адрес</span><p class="footer__text">${escapeHtml(site.address)}</p></div><div class="footer__column"><span class="footer__label">Навигация</span><div class="footer__nav"><a class="footer__nav-link" href="/works">Работы</a><a class="footer__nav-link" href="/#connect">Запись</a></div></div></div></div><div class="footer__bottom"><span class="footer__copy">© 2025–2026 CAR LIFE.</span><a class="footer__policy" href="/privacy-policy">Политика конфиденциальности</a></div></div></footer>
  <script src="/site/script/scripts.js"></script>
</body></html>`);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
