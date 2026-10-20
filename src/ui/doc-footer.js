import { el } from '../core/dom.js';
import { pagerText } from '../domain/format.js';

function buttonFor(doc, direction, onSelect) {
  const text = pagerText(doc, direction);

  return el('button', {
    type: 'button',
    class: 'footer-nav',
    disabled: !doc,
    'aria-label': text.aria,
    onclick: () => {
      if (doc) onSelect(doc.id);
    },
  }, [
    el('span', { class: 'footer-nav__dir', text: text.dir }),
    el('span', { class: 'footer-nav__chapter', text: text.label }),
  ]);
}

export function createDocFooter({ onPrev, onNext }) {
  const root = el('footer', { class: 'chapter-footer' });

  return {
    el: root,
    update({ prev, next }) {
      root.replaceChildren(
        buttonFor(prev, 'prev', onPrev),
        buttonFor(next, 'next', onNext),
      );
    },
  };
}
