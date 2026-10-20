import { el } from '../core/dom.js';

export function createGameCard(game, { onOpen }) {
  const art = el('div', { class: 'card__art' });
  const image = el('img', {
    src: game.art.main,
    alt: '',
    loading: 'lazy',
    decoding: 'async',
    width: '820',
    height: '640',
  });

  image.addEventListener('error', () => {
    image.remove();
    art.classList.add('is-fallback');
    art.append(el('span', { class: 'card__fallback', 'aria-hidden': 'true', text: game.id }));
  }, { once: true });
  art.append(image);

  const button = el('button', {
    type: 'button',
    class: 'card',
    dataset: { gameId: game.id },
    onclick: () => onOpen(game, button),
  }, [
    art,
    el('div', { class: 'card__body' }, [
      el('div', { class: 'card__top' }, [
        el('span', { class: 'card__no', text: game.id }),
        el('span', { class: 'card__ability', text: game.ability }),
      ]),
      el('h3', { class: 'card__title', text: game.name }),
      el('p', { class: 'card__meta', text: `${game.age} · ${game.duration}` }),
    ]),
  ]);

  return el('li', { class: 'card-item' }, [button]);
}
