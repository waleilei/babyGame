import { el } from '../core/dom.js';

function listFor(sections, onSelect) {
  const list = el('ol', { class: 'section-nav__list' });
  for (const section of sections) {
    list.append(el('li', { class: `section-nav__item section-nav__item--h${section.level}` }, [
      el('button', {
        type: 'button',
        class: 'section-nav__button',
        dataset: { sectionId: section.id },
        text: section.title,
        onclick: () => onSelect(section.id),
      }),
    ]));
  }
  return list;
}

export function createSectionNav(sections, { onSelect }) {
  const long = sections.length > 12;
  const desktop = el('nav', {
    class: `section-nav section-nav--desktop${long ? ' is-long' : ''}`,
    'aria-label': '本页目录',
  }, [
    el('p', { class: 'section-nav__title', text: '本页目录' }),
    listFor(sections, onSelect),
  ]);

  const mobile = el('details', { class: 'section-nav section-nav--mobile' }, [
    el('summary', { class: 'section-nav__summary', text: `本页目录（${sections.length}）` }),
    el('nav', { class: 'section-nav__body', 'aria-label': '本页目录' }, [listFor(sections, onSelect)]),
  ]);

  return { desktop, mobile };
}
