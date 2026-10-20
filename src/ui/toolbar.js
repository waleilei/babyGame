import { el } from '../core/dom.js';
import { chapterButtonLabel } from '../domain/format.js';

export function createToolbar({ onHome, onPrev, onNext }) {
  const home = el('button', { type: 'button', class: 'toolbar__button toolbar__button--home', onclick: onHome }, [
    el('span', { class: 'toolbar__dir', text: '目录' }),
    el('span', { class: 'toolbar__chapter', text: '全部章节' }),
  ]);

  const prev = el('button', {
    type: 'button',
    class: 'toolbar__button',
    onclick: () => {
      const no = Number(prev.dataset.chapterNo);
      if (no) onPrev(no);
    },
  }, [
    el('span', { class: 'toolbar__dir', text: '← 上一章' }),
    el('span', { class: 'toolbar__chapter' }),
  ]);

  const next = el('button', {
    type: 'button',
    class: 'toolbar__button',
    onclick: () => {
      const no = Number(next.dataset.chapterNo);
      if (no) onNext(no);
    },
  }, [
    el('span', { class: 'toolbar__dir', text: '下一章 →' }),
    el('span', { class: 'toolbar__chapter' }),
  ]);

  function setButton(button, chapter, direction) {
    const isPrev = direction === 'prev';
    button.disabled = !chapter;
    button.dataset.chapterNo = chapter ? String(chapter.no) : '';
    button.querySelector('.toolbar__dir').textContent = isPrev ? '← 上一章' : '下一章 →';
    button.querySelector('.toolbar__chapter').textContent = chapter
      ? chapterButtonLabel(chapter)
      : isPrev ? '已是第一章' : '已是最后一章';
    button.setAttribute('aria-label', chapter
      ? `${isPrev ? '上一章' : '下一章'}：第${chapter.no}章 ${chapter.title}`
      : isPrev ? '已经是第一章' : '已经是最后一章');
  }

  return {
    el: el('div', { class: 'chapter-bar' }, [
      el('nav', { class: 'toolbar', 'aria-label': '章节导航' }, [home, prev, next]),
    ]),
    update({ prev: prevChapter, next: nextChapter }) {
      setButton(prev, prevChapter, 'prev');
      setButton(next, nextChapter, 'next');
    },
  };
}
