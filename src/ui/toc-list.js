import { el } from '../core/dom.js';
import { chapterHeading } from '../domain/format.js';

export function createTocList(parts) {
  const nav = el('nav', { class: 'toc', 'aria-label': '章节目录' });

  for (const part of parts) {
    const list = el('ul', { class: 'toc__list' });
    for (const chapter of part.chapters) {
      list.append(
        el('li', {}, [
          el('a', {
            class: 'toc-row',
            href: `#/ch/${chapter.no}`,
            'aria-label': `${chapterHeading(chapter)}，${chapter.age}，${chapter.count} 个游戏`,
          }, [
            el('span', { class: 'toc-row__no', 'aria-hidden': 'true', text: String(chapter.no).padStart(2, '0') }),
            el('span', { class: 'toc-row__main', 'aria-hidden': 'true' }, [
              el('span', { class: 'toc-row__title', text: chapter.title }),
              el('span', { class: 'toc-row__meta', text: `${chapter.age} · ${chapter.count} 个游戏` }),
            ]),
            el('span', { class: 'toc-row__arrow', 'aria-hidden': 'true', text: '→' }),
          ]),
        ]),
      );
    }
    nav.append(el('section', { class: 'toc__part' }, [
      el('h2', { class: 'toc__part-title', text: part.title }),
      list,
    ]));
  }

  return nav;
}
