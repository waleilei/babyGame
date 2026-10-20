import { el } from '../core/dom.js';
import { pagerText } from '../domain/format.js';

export function createToolbar({ onHome, onPrev, onNext }) {
  const home = el('button', { type: 'button', class: 'toolbar__button toolbar__button--home', onclick: onHome }, [
    el('span', { class: 'toolbar__dir', text: '目录' }),
    el('span', { class: 'toolbar__chapter', text: '全书目录' }),
  ]);

  const prev = el('button', {
    type: 'button',
    class: 'toolbar__button',
    onclick: () => {
      const docId = prev.dataset.docId;
      if (docId) onPrev(docId);
    },
  }, [
    el('span', { class: 'toolbar__dir' }),
    el('span', { class: 'toolbar__chapter' }),
  ]);

  const next = el('button', {
    type: 'button',
    class: 'toolbar__button',
    onclick: () => {
      const docId = next.dataset.docId;
      if (docId) onNext(docId);
    },
  }, [
    el('span', { class: 'toolbar__dir' }),
    el('span', { class: 'toolbar__chapter' }),
  ]);

  function setButton(button, doc, direction) {
    const text = pagerText(doc, direction);
    button.disabled = !doc;
    button.dataset.docId = doc?.id ?? '';
    button.querySelector('.toolbar__dir').textContent = text.dir;
    button.querySelector('.toolbar__chapter').textContent = text.label;
    button.setAttribute('aria-label', text.aria);
  }

  return {
    el: el('div', { class: 'chapter-bar' }, [
      el('nav', { class: 'toolbar', 'aria-label': '文档导航' }, [home, prev, next]),
    ]),
    update({ prev: prevDoc, next: nextDoc }) {
      setButton(prev, prevDoc, 'prev');
      setButton(next, nextDoc, 'next');
    },
  };
}
