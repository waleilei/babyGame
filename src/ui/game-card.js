import { el } from '../core/dom.js';

/**
 * 卡片拆成两个按钮：图片查看大图，文字查看玩法详情。
 * @param {any} game
 * @param {{ onOpen: (game: any, trigger: HTMLButtonElement) => void, onZoom: (game: any, trigger: HTMLButtonElement, index: number) => void }} options
 */
export function createGameCard(game, { onOpen, onZoom }) {
  const art = el('span', { class: 'card__art' });
  let zoomButton = null;
  const image = el('img', {
    src: game.art.main,
    alt: '',
    loading: 'lazy',
    decoding: 'async',
    width: '900',
    height: '600',
  });

  image.addEventListener('error', () => {
    image.remove();
    art.classList.add('is-fallback');
    art.append(el('span', { class: 'card__fallback', 'aria-hidden': 'true', text: game.id }));
    if (zoomButton) zoomButton.disabled = true;
  }, { once: true });
  art.append(image);

  zoomButton = el('button', {
    type: 'button',
    class: 'card__art-button',
    'aria-label': `查看《${game.name}》主图大图`,
    onclick: () => onZoom?.(game, zoomButton, 0),
  }, [
    art,
    el('span', { class: 'card__zoom-hint', 'aria-hidden': 'true', text: '查看大图' }),
  ]);

  const detailsButton = el('button', {
    type: 'button',
    class: 'card__body',
    dataset: { gameId: game.id },
    'aria-label': `查看《${game.name}》玩法详情，${game.age}，${game.ability}，${game.duration}`,
    onclick: () => onOpen(game, detailsButton),
  }, [
    el('span', { class: 'card__top' }, [
      el('span', { class: 'card__no', text: game.id }),
      el('span', { class: 'card__ability', text: game.ability }),
    ]),
    el('span', { class: 'card__title', text: game.name }),
    el('span', { class: 'card__meta', text: `${game.age} · ${game.duration}` }),
  ]);

  return el('li', { class: 'card-item' }, [
    el('article', { class: 'card' }, [zoomButton, detailsButton]),
  ]);
}
