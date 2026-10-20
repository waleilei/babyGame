import { el } from '../core/dom.js';

function inline(text) {
  const fragment = document.createDocumentFragment();
  String(text).split('**').forEach((part, index) => {
    if (!part) return;
    fragment.append(index % 2 === 1 ? el('strong', { text: part }) : document.createTextNode(part));
  });
  return fragment;
}

export function createIntro(blocks) {
  const root = el('section', { class: 'intro', 'aria-label': '章节导语' });

  for (const block of blocks) {
    if (block.type === 'ul') {
      const list = el('ul', { class: 'intro__list' });
      for (const item of block.items ?? []) list.append(el('li', {}, [inline(item)]));
      root.append(list);
    } else {
      root.append(el('p', { class: 'intro__p' }, [inline(block.text ?? '')]));
    }
  }

  return root;
}
