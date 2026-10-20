import { el } from '../core/dom.js';

export function createSearchResults({ query, results, onClear }) {
  const trimmed = query.trim();
  const root = el('section', { class: 'search-results', 'aria-label': '搜索结果' });
  if (!trimmed) return root;

  if (results.length === 0) {
    root.append(el('div', { class: 'search-empty' }, [
      el('div', {}, [
        el('p', { class: 'search-empty__title', text: `没有找到“${trimmed}”` }),
        el('p', { class: 'search-empty__text', text: '试试游戏名里的其他字，或清除搜索浏览全部章节。' }),
      ]),
      el('button', { type: 'button', class: 'button button--ghost', onclick: onClear }, ['清除搜索']),
    ]));
    return root;
  }

  const list = el('ul', { class: 'search-results__list' });
  for (const hit of results) {
    list.append(el('li', {}, [
      el('a', {
        class: 'search-hit',
        href: `#/ch/${hit.chapterNo}/game/${hit.id}`,
        'aria-label': `${hit.name}，第${hit.chapterNo}章，${hit.age}，${hit.ability}`,
      }, [
        el('span', { class: 'search-hit__name', 'aria-hidden': 'true', text: hit.name }),
        el('span', { class: 'search-hit__meta', 'aria-hidden': 'true', text: `第${hit.chapterNo}章 · ${hit.age} · ${hit.ability}` }),
      ]),
    ]));
  }
  root.append(list);
  return root;
}
