'use strict';

(() => {
  const gallery = document.querySelector('[data-work-gallery]');
  if (!gallery) return;

  const mainImage = gallery.querySelector('[data-gallery-main]');
  const stage = gallery.querySelector('[data-gallery-stage]');
  const viewport = gallery.querySelector('[data-gallery-viewport]');
  const previousButton = gallery.querySelector('[data-gallery-prev]');
  const nextButton = gallery.querySelector('[data-gallery-next]');
  const counter = gallery.querySelector('[data-gallery-current]');
  const thumbnails = [...gallery.querySelectorAll('[data-gallery-thumb]')];

  if (!mainImage || !stage || !viewport || !thumbnails.length) return;

  const images = thumbnails.map((thumbnail) => ({
    src: thumbnail.dataset.src || '',
    alt: thumbnail.dataset.alt || '',
  }));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let currentIndex = 0;
  let touchStart = null;
  let transitionTimer = 0;

  function normalizeIndex(index) {
    return (index + images.length) % images.length;
  }

  function centerThumbnail(thumbnail) {
    const item = thumbnail.closest('.work-gallery__thumb-item') || thumbnail;
    const left = item.offsetLeft - ((viewport.clientWidth - item.offsetWidth) / 2);
    viewport.scrollTo({ left, behavior: reduceMotion ? 'auto' : 'smooth' });
  }

  function selectImage(index, center = true) {
    const nextIndex = normalizeIndex(index);
    const image = images[nextIndex];
    if (!image?.src) return;

    currentIndex = nextIndex;
    window.clearTimeout(transitionTimer);
    mainImage.classList.add('is-switching');
    mainImage.src = image.src;
    mainImage.alt = image.alt;
    transitionTimer = window.setTimeout(() => mainImage.classList.remove('is-switching'), 160);

    thumbnails.forEach((thumbnail, thumbnailIndex) => {
      const active = thumbnailIndex === currentIndex;
      thumbnail.classList.toggle('is-active', active);
      thumbnail.toggleAttribute('aria-current', active);
      thumbnail.tabIndex = active ? 0 : -1;
    });

    if (counter) counter.textContent = String(currentIndex + 1);
    if (center) centerThumbnail(thumbnails[currentIndex]);
  }

  thumbnails.forEach((thumbnail, index) => {
    thumbnail.tabIndex = index === 0 ? 0 : -1;
    thumbnail.addEventListener('click', () => selectImage(index));
  });

  previousButton?.addEventListener('click', () => selectImage(currentIndex - 1));
  nextButton?.addEventListener('click', () => selectImage(currentIndex + 1));

  gallery.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    selectImage(currentIndex + (event.key === 'ArrowRight' ? 1 : -1));
  });

  viewport.addEventListener('wheel', (event) => {
    if (viewport.scrollWidth <= viewport.clientWidth) return;
    const delta = Math.abs(event.deltaY) > Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    if (!delta) return;

    const atStart = viewport.scrollLeft <= 0;
    const atEnd = viewport.scrollLeft + viewport.clientWidth >= viewport.scrollWidth - 1;
    if ((delta < 0 && atStart) || (delta > 0 && atEnd)) return;

    event.preventDefault();
    viewport.scrollBy({ left: delta, behavior: 'auto' });
  }, { passive: false });

  stage.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' || images.length < 2 || event.target.closest('button')) return;
    touchStart = { id: event.pointerId, x: event.clientX, y: event.clientY };
    stage.setPointerCapture?.(event.pointerId);
  });

  stage.addEventListener('pointerup', (event) => {
    if (!touchStart || touchStart.id !== event.pointerId) return;
    const deltaX = event.clientX - touchStart.x;
    const deltaY = event.clientY - touchStart.y;
    touchStart = null;

    if (Math.abs(deltaX) < 45 || Math.abs(deltaX) <= Math.abs(deltaY)) return;
    selectImage(currentIndex + (deltaX < 0 ? 1 : -1));
  });

  stage.addEventListener('pointercancel', () => {
    touchStart = null;
  });
})();
