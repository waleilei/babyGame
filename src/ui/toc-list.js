import { buildHash } from '../core/router.js';
import { el } from '../core/dom.js';
import { docLabel, groupLabel, isAppendixDoc } from '../domain/format.js';

function rowNo(doc) {
  if (doc.id === 'front') return '序';
  if (isAppendixDoc(doc)) return doc.id.slice(-1).toUpperCase();
  return String(doc.no).padStart(2, '0');
}

function rowTitle(doc) {
  if (doc.id === 'front' || isAppendixDoc(doc)) return doc.shortTitle;
  return doc.title;
}

function rowMeta(doc) {
  if (doc.kind === 'games') return `${doc.meta} · ${doc.count} 个游戏`;
  return doc.meta;
}

export function createTocList(groups) {
  const nav = el('nav', { class: 'toc', 'aria-label': '全书目录' });

  for (const group of groups) {
    const list = el('ul', { class: 'toc__list' });
    for (const doc of group.docs) {
      const meta = rowMeta(doc);
      list.append(
        el('li', {}, [
          el('a', {
            class: 'toc-row',
            href: buildHash({ name: 'doc', docId: doc.id }),
            'aria-label': `${docLabel(doc)}，${doc.meta}${doc.kind === 'games' ? `，${doc.count} 个游戏` : ''}`,
          }, [
            el('span', { class: 'toc-row__no', 'aria-hidden': 'true', text: rowNo(doc) }),
            el('span', { class: 'toc-row__main', 'aria-hidden': 'true' }, [
              el('span', { class: 'toc-row__title', text: rowTitle(doc) }),
              el('span', { class: 'toc-row__meta', text: meta }),
            ]),
            el('span', { class: 'toc-row__arrow', 'aria-hidden': 'true', text: '→' }),
          ]),
        ]),
      );
    }
    nav.append(el('section', { class: 'toc__part' }, [
      el('h2', { class: 'toc__part-title', text: groupLabel(group) }),
      list,
    ]));
  }

  return nav;
}
