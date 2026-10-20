import { el } from '../core/dom.js';
import { artAlt } from '../domain/format.js';
import { createDocFooter } from '../ui/doc-footer.js';
import { createGameDialog } from '../ui/game-dialog.js';
import { createImageLightbox } from '../ui/image-lightbox.js';
import { createErrorBlock, createSkeleton } from '../ui/states.js';
import { createToolbar } from '../ui/toolbar.js';
import { createGamesBody } from './games-body.js';
import { createProseBody } from './prose-body.js';

/**
 * 文档页外壳：工具栏、正文宿主、页脚、游戏弹层与大图、方向键导航。
 * 正文按 kind 分成游戏章（games-body）与文字章（prose-body）两条渲染路径。
 */
export function createDocPage({ onHome, onPrev, onNext, onOpenGame, onCloseGame, onRetry }) {
  const toolbar = createToolbar({ onHome, onPrev, onNext });
  const footer = createDocFooter({ onPrev, onNext });
  const bodyHost = el('div', { class: 'doc-body' });
  const stateHost = el('div', { class: 'doc-state' });
  const root = el('div', { class: 'doc-page' }, [toolbar.el, bodyHost, stateHost, footer.el]);

  let body = null;
  let renderedDocId = '';
  let prevDoc = null;
  let nextDoc = null;
  let dialog = null;
  let lightbox = null;
  let lastGameId = null;
  let lastTrigger = null;

  function openLightbox(game, index, trigger) {
    lightbox.open({
      title: game.name,
      images: game.art.panels.map((src, imageIndex) => ({ src, alt: artAlt(game, imageIndex) })),
      index,
      trigger,
    });
  }

  function ensureGameComponents() {
    if (dialog) return;
    lightbox = createImageLightbox();
    dialog = createGameDialog({
      onRequestClose: () => {
        finishGameClose(true);
        onCloseGame();
      },
      onZoomImage: (game, index, trigger) => openLightbox(game, index, trigger),
    });
    root.append(dialog.el, lightbox.el);
  }

  function restoreFocusTo(trigger) {
    if (trigger?.isConnected) trigger.focus();
    else (body?.focusFallback ?? body?.focusTitle)?.();
  }

  function finishGameClose(restoreFocus) {
    const trigger = lastTrigger;
    lastTrigger = null;
    lastGameId = null;
    if (restoreFocus) restoreFocusTo(trigger);
  }

  function closeGameBits(restoreFocus = false) {
    if (!dialog?.isOpen()) return;
    lightbox?.close({ restoreFocus: false });
    dialog.close();
    finishGameClose(restoreFocus);
  }

  function createBody(kind) {
    if (kind === 'games') {
      ensureGameComponents();
      return createGamesBody({
        onOpenGame: (game, trigger) => {
          lastTrigger = trigger;
          onOpenGame(game.id);
        },
        onZoom: openLightbox,
      });
    }
    return createProseBody();
  }

  function renderReady(view, kind) {
    if (!body || body.kind !== kind || renderedDocId !== view.doc.id) {
      closeGameBits();
      body?.destroy();
      body = createBody(kind);
      renderedDocId = view.doc.id;
      bodyHost.replaceChildren(body.el);
    }

    bodyHost.hidden = false;
    stateHost.replaceChildren();
    footer.el.hidden = false;
    body.update({ doc: view.doc, toc: view.toc, entry: view.entry });

    if (kind !== 'games') return;

    if (view.game) {
      if (!dialog.isOpen() || lastGameId !== view.game.id) {
        dialog.open(view.game);
        lastGameId = view.game.id;
      }
    } else if (dialog.isOpen()) {
      closeGameBits(true);
    }
  }

  function renderPending(view) {
    closeGameBits();
    body?.destroy();
    body = null;
    renderedDocId = '';
    bodyHost.replaceChildren();
    bodyHost.hidden = true;
    footer.el.hidden = true;
    stateHost.replaceChildren(
      view.status === 'error'
        ? createErrorBlock({ title: '文档加载失败', error: view.error, onRetry, onHome })
        : createSkeleton(view.kind === 'games' ? 'chapter' : 'prose'),
    );
  }

  function update(view) {
    prevDoc = view.prev ?? null;
    nextDoc = view.next ?? null;
    toolbar.update({ prev: prevDoc, next: nextDoc });
    footer.update({ prev: prevDoc, next: nextDoc });

    if (view.status === 'ready' && view.doc) {
      renderReady(view, view.kind ?? view.doc.kind);
      return;
    }
    renderPending(view);
  }

  function onKeydown(event) {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    if (dialog?.isOpen() || lightbox?.isOpen()) return;

    const target = event.target;
    if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) {
      return;
    }

    if (event.key === 'ArrowLeft' && prevDoc) {
      event.preventDefault();
      onPrev(prevDoc.id);
    } else if (event.key === 'ArrowRight' && nextDoc) {
      event.preventDefault();
      onNext(nextDoc.id);
    }
  }

  window.addEventListener('keydown', onKeydown);
  update({ status: 'idle' });

  return {
    el: root,
    update,
    focusTitle: () => body?.focusTitle?.(),
    destroy() {
      window.removeEventListener('keydown', onKeydown);
      body?.destroy();
      lightbox?.destroy();
      dialog?.destroy();
    },
  };
}
