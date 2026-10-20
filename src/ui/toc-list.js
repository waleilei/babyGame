import { buildHash } from '../core/router.js';
import { el } from '../core/dom.js';
import { docFamily, docLabel, groupLabel, tocBadge } from '../domain/format.js';

function rowNo(doc) {
  const family = docFamily(doc);
  if (family === 'front') return '序';
  if (family === 'appendix') return doc.id.slice(-1).toUpperCase();
  return String(doc.no).padStart(2, '0');
}

function rowTitle(doc) {
  return docFamily(doc) === 'chapter' ? doc.title : doc.shortTitle;
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
      const badge = tocBadge(doc);
      list.append(
        el('li', {}, [
          el('a', {
            class: 'toc-row',
            href: buildHash({ name: 'doc', docId: doc.id }),
            'aria-label': `${docLabel(doc)}，${badge ? `${badge}，` : ''}${doc.meta}${doc.kind === 'games' ? `，${doc.count} 个游戏` : ''}`,
          }, [
            el('span', { class: 'toc-row__no', 'aria-hidden': 'true', text: rowNo(doc) }),
            el('span', { class: 'toc-row__main', 'aria-hidden': 'true' }, [
              el('span', { class: 'toc-row__title', text: rowTitle(doc) }),
              el('span', { class: 'toc-row__meta', text: meta }),
            ]),
            badge
              ? el('span', {
                  class: `toc-row__badge${badge === '图文' ? ' toc-row__badge--art' : ''}`,
                  'aria-hidden': 'true',
                  text: badge,
                })
              : null,
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
