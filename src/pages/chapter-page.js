import { el } from '../core/dom.js';
import { chapterButtonLabel } from '../domain/format.js';
import { createErrorBlock, createSkeleton } from '../ui/states.js';
import { createGameDialog } from '../ui/game-dialog.js';
import { createGameGrid } from '../ui/game-grid.js';
import { createImageLightbox } from '../ui/image-lightbox.js';
import { createIntro } from '../ui/intro.js';
import { createToolbar } from '../ui/toolbar.js';

function footerButton(chapter, direction, handler) {
  const isPrev = direction === 'prev';
  const label = chapter ? chapterButtonLabel(chapter) : isPrev ? '已是第一章' : '已是最后一章';

  return el('button', {
    type: 'button',
    class: 'footer-nav',
    disabled: !chapter,
    'aria-label': chapter ? `${isPrev ? '上一章' : '下一章'}：第${chapter.no}章 ${chapter.title}` : label,
    onclick: () => {
      if (chapter) handler(chapter.no);
    },
  }, [
    el('span', { class: 'footer-nav__dir', text: isPrev ? '← 上一章' : '下一章 →' }),
    el('span', { class: 'footer-nav__chapter', text: label }),
  ]);
}

export function createChapterPage({ onHome, onPrev, onNext, onOpenGame, onCloseGame, onRetry }) {
  const toolbar = createToolbar({ onHome, onPrev, onNext });
  const title = el('h1', { class: 'chapter__title', tabindex: '-1' });
  const meta = el('p', { class: 'chapter__meta' });
  const introHost = el('div', { class: 'chapter__intro-host' });
  const gridHost = el('div', { class: 'chapter__grid-host' });
  const footer = el('footer', { class: 'chapter-footer' });
  const chapterBody = el('div', { class: 'chapter__body' }, [title, meta, introHost, gridHost, footer]);
  const content = el('div', { class: 'chapter' }, [chapterBody]);

  let lastTrigger = null;
  let gridTitle = null;
  let renderedNo = null;
  let wasGameOpen = false;
  let lastGameId = null;
  let prevChapter = null;
  let nextChapter = null;

  function restoreFocus(trigger) {
    if (trigger?.isConnected) trigger.focus();
    else if (gridTitle?.isConnected) gridTitle.focus();
    else title.focus({ preventScroll: true });
  }

  const lightbox = createImageLightbox();

  function openLightbox(game, index, trigger) {
    lightbox.open({
      title: game.name,
      images: game.art.panels.map((src, i) => ({ src, alt: `${game.name}步骤图 ${i + 1}` })),
      index,
      trigger,
    });
  }

  const dialog = createGameDialog({
    onRequestClose: () => {
      const trigger = lastTrigger;
      lastTrigger = null;
      wasGameOpen = false;
      lastGameId = null;
      restoreFocus(trigger);
      onCloseGame();
    },
    onZoomImage: (game, index, trigger) => openLightbox(game, index, trigger),
  });

  const root = el('div', { class: 'chapter-page' }, [toolbar.el, content, dialog.el, lightbox.el]);

  function renderChapter(view) {
    const chapter = view.chapter;
    title.textContent = `第${chapter.no}章 ${chapter.title}`;
    meta.textContent = `${chapter.age} · ${chapter.games.length} 个游戏`;
    introHost.replaceChildren(createIntro(chapter.intro));

    const grid = createGameGrid(chapter.games, {
      onOpen: (game, trigger) => {
        lastTrigger = trigger;
        onOpenGame(game.id);
      },
      onZoom: (game, trigger) => openLightbox(game, 0, trigger),
    });
    gridTitle = grid.title;
    gridHost.replaceChildren(grid.el);
    footer.replaceChildren(
      footerButton(view.prev, 'prev', onPrev),
      footerButton(view.next, 'next', onNext),
    );
  }

  function update(view) {
    prevChapter = view.prev ?? null;
    nextChapter = view.next ?? null;
    toolbar.update({ prev: prevChapter, next: nextChapter });

    if (view.status === 'ready') {
      if (content.firstElementChild !== chapterBody) content.replaceChildren(chapterBody);
      if (renderedNo !== view.chapter.no) {
        renderedNo = view.chapter.no;
        renderChapter(view);
      }

      if (view.game) {
        if (!wasGameOpen || lastGameId !== view.game.id) {
          dialog.open(view.game);
          wasGameOpen = true;
          lastGameId = view.game.id;
        }
      } else if (wasGameOpen) {
        lightbox.close({ restoreFocus: false });
        dialog.close();
        wasGameOpen = false;
        lastGameId = null;
        const trigger = lastTrigger;
        lastTrigger = null;
        restoreFocus(trigger);
      }
      return;
    }

    renderedNo = null;
    if (wasGameOpen) {
      lightbox.close({ restoreFocus: false });
      dialog.close();
      wasGameOpen = false;
      lastGameId = null;
      lastTrigger = null;
    }

    content.replaceChildren(
      view.status === 'error'
        ? createErrorBlock({ title: '本章加载失败', error: view.error, onRetry, onHome })
        : createSkeleton('chapter'),
    );
  }

  function onKeydown(event) {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || dialog.isOpen() || lightbox.isOpen()) return;
    const target = event.target;
    if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;

    if (event.key === 'ArrowLeft' && prevChapter) {
      event.preventDefault();
      onPrev(prevChapter.no);
    } else if (event.key === 'ArrowRight' && nextChapter) {
      event.preventDefault();
      onNext(nextChapter.no);
    }
  }

  window.addEventListener('keydown', onKeydown);
  update({ status: 'loading' });

  return {
    el: root,
    update,
    focusTitle: () => title.focus({ preventScroll: true }),
    destroy() {
      window.removeEventListener('keydown', onKeydown);
      lightbox.destroy();
      dialog.destroy();
    },
  };
}
