import { bindDialogClose } from '../core/dialog.js';
import { el } from '../core/dom.js';
import {
  MAX_SCALE,
  MIN_SCALE,
  WHEEL_ZOOM_RATE,
  ZOOM_DOUBLE_CLICK,
  ZOOM_STEP,
  clampOffset,
  clampScale,
  isZoomed,
  zoomAround,
} from '../domain/zoom.js';

/**
 * 图片大图查看器：原生 dialog 叠层，支持滚轮/双指缩放、拖拽平移、键盘切换。
 */
export function createImageLightbox() {
  let images = [];
  let index = 0;
  let trigger = null;
  let transform = { scale: 1, x: 0, y: 0 };
  const pointers = new Map();
  let drag = null;
  let pinch = null;

  const title = el('h2', { class: 'image-lightbox__title', id: 'image-lightbox-title', text: '查看大图' });
  const caption = el('p', { class: 'image-lightbox__caption', 'aria-live': 'polite' });
  const closeButton = el('button', {
    type: 'button',
    class: 'image-lightbox__button image-lightbox__close',
    'aria-label': '关闭大图',
    onclick: () => close(),
  }, ['×']);

  const image = el('img', {
    class: 'image-lightbox__image',
    alt: '',
    draggable: 'false',
    decoding: 'async',
  });
  const error = el('p', { class: 'image-lightbox__error', hidden: true, text: '图片加载失败' });
  const stage = el('div', { class: 'image-lightbox__stage' }, [image, error]);

  const prevButton = el('button', {
    type: 'button',
    class: 'image-lightbox__button',
    'aria-label': '上一张',
    onclick: () => show(index - 1),
  }, ['‹']);

  const nextButton = el('button', {
    type: 'button',
    class: 'image-lightbox__button',
    'aria-label': '下一张',
    onclick: () => show(index + 1),
  }, ['›']);

  const zoomOutButton = el('button', {
    type: 'button',
    class: 'image-lightbox__button',
    'aria-label': '缩小',
    onclick: () => zoomTo(transform.scale / ZOOM_STEP),
  }, ['−']);

  const resetButton = el('button', {
    type: 'button',
    class: 'image-lightbox__button',
    'aria-label': '恢复原始大小',
    onclick: () => reset(),
  }, ['1:1']);

  const zoomInButton = el('button', {
    type: 'button',
    class: 'image-lightbox__button',
    'aria-label': '放大',
    onclick: () => zoomTo(transform.scale * ZOOM_STEP),
  }, ['+']);

  const dialog = el('dialog', { class: 'image-lightbox', 'aria-labelledby': 'image-lightbox-title' }, [
    el('div', { class: 'image-lightbox__panel' }, [
      el('header', { class: 'image-lightbox__bar' }, [
        el('div', { class: 'image-lightbox__heading' }, [title, caption]),
        closeButton,
      ]),
      stage,
      el('footer', { class: 'image-lightbox__footer' }, [
        el('div', { class: 'image-lightbox__group' }, [prevButton, nextButton]),
        el('div', { class: 'image-lightbox__group' }, [zoomOutButton, resetButton, zoomInButton]),
      ]),
      el('p', { class: 'image-lightbox__hint', text: '滚轮或双指缩放 · 拖拽平移 · Esc 关闭' }),
    ]),
  ]);

  function apply() {
    image.style.transform = `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`;
    stage.classList.toggle('is-zoomed', isZoomed(transform.scale));
    zoomOutButton.disabled = !isZoomed(transform.scale);
    zoomInButton.disabled = transform.scale >= MAX_SCALE;
    resetButton.disabled = !isZoomed(transform.scale) && transform.x === 0 && transform.y === 0;
    prevButton.disabled = index <= 0;
    nextButton.disabled = index >= images.length - 1;
  }

  function setTransform(next) {
    const rect = stage.getBoundingClientRect();
    transform = clampOffset(
      { scale: clampScale(next.scale), x: next.x, y: next.y },
      { width: Math.max(1, rect.width), height: Math.max(1, rect.height) },
    );
    apply();
  }

  function reset() {
    setTransform({ scale: MIN_SCALE, x: 0, y: 0 });
  }

  function pointFromClient(clientX, clientY) {
    const rect = stage.getBoundingClientRect();
    return {
      x: clientX - rect.left - rect.width / 2,
      y: clientY - rect.top - rect.height / 2,
    };
  }

  function zoomTo(nextScale, point = { x: 0, y: 0 }) {
    setTransform(zoomAround(transform, nextScale, point));
  }

  function show(nextIndex) {
    if (images.length === 0) return;
    index = Math.min(images.length - 1, Math.max(0, nextIndex));
    const item = images[index];
    image.hidden = false;
    error.hidden = true;
    image.alt = item.alt;
    caption.textContent = `第 ${index + 1} / ${images.length} 张`;

    if (image.getAttribute('src') === item.src && image.complete && image.naturalWidth > 0) {
      image.classList.add('is-loaded');
    } else {
      image.classList.remove('is-loaded');
      image.src = item.src;
    }

    reset();
    const next = images[index + 1];
    if (next) new Image().src = next.src;
  }

  image.addEventListener('load', () => {
    image.hidden = false;
    error.hidden = true;
    image.classList.add('is-loaded');
  });

  image.addEventListener('error', () => {
    image.hidden = true;
    error.hidden = false;
  });

  function onWheel(event) {
    event.preventDefault();
    zoomTo(transform.scale * Math.exp(-event.deltaY * WHEEL_ZOOM_RATE), pointFromClient(event.clientX, event.clientY));
  }

  function onPointerDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    try {
      stage.setPointerCapture(event.pointerId);
    } catch {}
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.size === 1 && isZoomed(transform.scale)) {
      drag = { x: event.clientX, y: event.clientY, originX: transform.x, originY: transform.y };
      stage.classList.add('is-dragging');
    } else if (pointers.size === 2) {
      drag = null;
      const [a, b] = [...pointers.values()];
      pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), scale: transform.scale };
    }
  }

  function onPointerMove(event) {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch.distance > 0) {
        setTransform({ scale: pinch.scale * (distance / pinch.distance), x: transform.x, y: transform.y });
      }
      return;
    }

    if (drag) {
      setTransform({
        scale: transform.scale,
        x: drag.originX + event.clientX - drag.x,
        y: drag.originY + event.clientY - drag.y,
      });
    }
  }

  function onPointerEnd(event) {
    pointers.delete(event.pointerId);
    try {
      stage.releasePointerCapture(event.pointerId);
    } catch {}
    if (pointers.size < 2) pinch = null;

    if (pointers.size === 1 && isZoomed(transform.scale)) {
      const [point] = [...pointers.values()];
      drag = { x: point.x, y: point.y, originX: transform.x, originY: transform.y };
    } else if (pointers.size === 0) {
      drag = null;
      stage.classList.remove('is-dragging');
    }
  }

  stage.addEventListener('wheel', onWheel, { passive: false });
  stage.addEventListener('pointerdown', onPointerDown);
  stage.addEventListener('pointermove', onPointerMove);
  stage.addEventListener('pointerup', onPointerEnd);
  stage.addEventListener('pointercancel', onPointerEnd);
  stage.addEventListener('dblclick', (event) => {
    if (isZoomed(transform.scale)) reset();
    else zoomTo(ZOOM_DOUBLE_CLICK, pointFromClient(event.clientX, event.clientY));
  });

  const closeDialog = bindDialogClose(dialog, () => close());

  function close({ restoreFocus = true } = {}) {
    if (!dialog.open) return;
    closeDialog();
    pointers.clear();
    drag = null;
    pinch = null;
    stage.classList.remove('is-dragging');
    if (restoreFocus && trigger?.isConnected) trigger.focus();
    trigger = null;
  }

  // Esc 归属按「谁在最上层」判定，不按时间。大图打开时在 document 捕获阶段吞掉这次 Esc：
  // preventDefault 抑制浏览器派发 cancel，stopPropagation 让它到不了底层的游戏详情。大图一旦
  // 关闭，同一个处理器立即失效，下一次 Esc 自然落到游戏详情 —— 因此不需要任何拦截窗口。
  function onDocumentEscape(event) {
    if (event.key !== 'Escape' || event.altKey || event.ctrlKey || event.metaKey) return;
    if (!dialog.open) return;
    event.preventDefault();
    event.stopPropagation();
    close();
  }

  document.addEventListener('keydown', onDocumentEscape, true);

  dialog.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      show(index - 1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      show(index + 1);
    } else if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      zoomTo(transform.scale * ZOOM_STEP);
    } else if (event.key === '-') {
      event.preventDefault();
      zoomTo(transform.scale / ZOOM_STEP);
    } else if (event.key === '0') {
      event.preventDefault();
      reset();
    }
  });

  return {
    el: dialog,

    open({ images: list, index: start = 0, title: heading, trigger: source }) {
      images = list;
      title.textContent = heading;
      trigger = source;
      show(start);
      if (!dialog.open) {
        dialog.showModal();
        closeButton.focus();
      }
    },

    close,
    destroy() {
      document.removeEventListener('keydown', onDocumentEscape, true);
      close({ restoreFocus: false });
    },
    isOpen: () => dialog.open,
  };
}
