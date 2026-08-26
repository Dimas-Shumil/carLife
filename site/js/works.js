'use strict';

(() => {
  const list = document.querySelector('[data-works-list]');
  if (!list) return;
  const loading = document.querySelector('[data-works-loading]');
  const empty = document.querySelector('[data-works-empty]');
  const errorState = document.querySelector('[data-works-error]');

  function createWorkCard(work) {
    const article = document.createElement('article');
    article.className = 'works-card';
    const link = document.createElement('a');
    link.className = 'works-card__link';
    link.href = `/works/${encodeURIComponent(work.slug)}`;
    link.setAttribute('aria-label', `Открыть работу ${work.title}`);
    const media = document.createElement('div');
    media.className = 'works-card__media';
    const image = document.createElement('img');
    image.src = work.cover.imagePath;
    image.alt = work.cover.alt || work.title;
    image.loading = 'lazy';
    image.decoding = 'async';
    media.append(image);
    const body = document.createElement('div');
    body.className = 'works-card__body';
    const meta = document.createElement('div');
    meta.className = 'works-card__meta';
    const service = document.createElement('span');
    service.textContent = work.service;
    const location = document.createElement('span');
    location.textContent = work.location || 'Абакан';
    meta.append(service, location);
    const title = document.createElement('h2');
    title.textContent = work.title;
    const description = document.createElement('p');
    description.textContent = work.shortDescription || work.car;
    const footer = document.createElement('div');
    footer.className = 'works-card__footer';
    const car = document.createElement('span');
    car.textContent = work.car;
    const duration = document.createElement('span');
    duration.textContent = work.durationText || 'Подробнее';
    footer.append(car, duration);
    body.append(meta, title, description, footer);
    article.append(link, media, body);
    return article;
  }

  async function init() {
    try {
      const response = await fetch('/api/works?limit=50', { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('Works request failed');
      const payload = await response.json();
      const works = Array.isArray(payload.items) ? payload.items : [];
      list.replaceChildren(...works.map(createWorkCard));
      empty.hidden = works.length > 0;
    } catch {
      errorState.hidden = false;
    } finally {
      loading.hidden = true;
    }
  }

  init();
})();
