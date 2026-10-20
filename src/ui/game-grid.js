import { el } from '../core/dom.js';
import { createGameCard } from './game-card.js';

export function createGameGrid(games, { onOpen }) {
  const title = el('h2', { class: 'game-grid__title', id: 'game-grid-title', tabindex: '-1' }, [
    el('span', { text: '本章游戏' }),
    el('span', { class: 'game-grid__count', text: `${games.length} 个` }),
  ]);

  const list = el('ul', { class: 'game-grid', 'aria-labelledby': 'game-grid-title' });
  games.forEach((game) => list.append(createGameCard(game, { onOpen })));

  return {
    el: el('section', { class: 'game-grid-section' }, [title, list]),
    title,
  };
}
