import { el } from '../core/dom.js';
import { buildHash } from '../core/router.js';
import {
  searchEmptyTitle,
  searchHitMeta,
  searchHitTypeLabel,
} from '../domain/format.js';

export function createSearchResults({ query, results, onClear }) {
  const trimmed = query.trim();
  const root = el('section', { class: 'search-results', 'aria-label': '搜索结果' });
  if (!trimmed) return root;

  if (results.length === 0) {
    root.append(el('div', { class: 'search-empty' }, [
      el('div', {}, [
        el('p', { class: 'search-empty__title', text: searchEmptyTitle(trimmed) }),
        el('p', { class: 'search-empty__text', text: '试试游戏名或章节标题里的其他字，或清除搜索浏览全书。' }),
      ]),
      el('button', { type: 'button', class: 'button button--ghost', onclick: onClear }, ['清除搜索']),
    ]));
    return root;
  }

  const list = el('ul', { class: 'search-results__list' });
  for (const hit of results) {
    const type = searchHitTypeLabel(hit);
    const meta = searchHitMeta(hit);
    list.append(el('li', {}, [
      el('a', {
        class: 'search-hit',
        href: buildHash({
          name: 'doc',
          docId: hit.docId,
          gameId: hit.kind === 'game' ? hit.gameId : null,
        }),
        'aria-label': `${type}：${hit.title}，${meta}`,
      }, [
        el('span', { class: 'search-hit__main', 'aria-hidden': 'true' }, [
          el('span', { class: 'search-hit__tag', text: type }),
          el('span', { class: 'search-hit__name', text: hit.title }),
        ]),
        el('span', { class: 'search-hit__meta', 'aria-hidden': 'true', text: meta }),
      ]),
    ]));
  }
  root.append(list);
  return root;
}
