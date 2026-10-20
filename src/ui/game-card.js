import { el } from '../core/dom.js';

/**
 * 卡片是单一入口：整卡点击进入游戏详情页。
 * @param {any} game
 * @param {{ onOpen: (game: any, trigger: HTMLButtonElement) => void }} options
 */
export function createGameCard(game, { onOpen }) {
  const art = el('span', { class: 'card__art' });
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
  }, { once: true });
  art.append(image);

  const card = el('button', {
    type: 'button',
    class: 'card',
    dataset: { gameId: game.id },
    'aria-label': `查看《${game.name}》玩法详情，${game.age}，${game.ability}，${game.duration}`,
    onclick: () => onOpen(game, card),
  }, [
    art,
    el('span', { class: 'card__text' }, [
      el('span', { class: 'card__top' }, [
        el('span', { class: 'card__no', text: game.id }),
        el('span', { class: 'card__ability', text: game.ability }),
      ]),
      el('span', { class: 'card__title', text: game.name }),
      el('span', { class: 'card__meta', text: `${game.age} · ${game.duration}` }),
    ]),
  ]);

  return el('li', { class: 'card-item' }, [card]);
}
