import { el } from '../core/dom.js';
import { artAlt, docHeading } from '../domain/format.js';
import { createDocFooter } from '../ui/doc-footer.js';
import { createGameDetail } from '../ui/game-detail.js';
import { createImageLightbox } from '../ui/image-lightbox.js';
import { createErrorBlock, createSkeleton } from '../ui/states.js';
import { createToolbar } from '../ui/toolbar.js';
import { createGamesBody } from './games-body.js';
import { createProseBody } from './prose-body.js';

/**
 * 文档页外壳：工具栏、正文宿主、页脚、游戏详情视图与大图、方向键导航。
 * 正文按 kind 分成游戏章（games-body）与文字章（prose-body）两条渲染路径。
 * 游戏详情是同一页面实例内的第二个视图：列表视图 ⇄ 详情视图，由路由 gameId 派生。
 */
export function createDocPage({ onHome, onPrev, onNext, onOpenGame, onBackGame, onSwitchGame, onRetry }) {
  const toolbar = createToolbar({ onHome, onPrev, onNext });
  const footer = createDocFooter({ onPrev, onNext });
  const bodyHost = el('div', { class: 'doc-body' });
  const stateHost = el('div', { class: 'doc-state' });
  const detailHost = el('div', { class: 'game-detail-host', hidden: true });
  const root = el('div', { class: 'doc-page' }, [toolbar.el, bodyHost, stateHost, footer.el, detailHost]);

  let body = null;
  let renderedDocId = '';
  let detail = null;
  let lightbox = null;
  let lastGameKey = '';
  let lastTrigger = null;
  let savedScrollY = 0;
  let detailOpen = false;
  let prevGame = null;
  let nextGame = null;
  let prevDocRef = null;
  let nextDocRef = null;

  function openLightbox(game, index, trigger) {
    lightbox.open({
      title: game.name,
      images: game.art.panels.map((src, imageIndex) => ({ src, alt: artAlt(game, imageIndex) })),
      index,
      trigger,
    });
  }

  function ensureDetailComponents() {
    if (detail) return;
    lightbox = createImageLightbox();
    detail = createGameDetail({
      onBack: onBackGame,
      onSwitchGame,
      onZoomImage: openLightbox,
    });
    detailHost.replaceChildren(detail.el);
    root.append(lightbox.el);
  }

  function showDetailView() {
    toolbar.el.hidden = true;
    bodyHost.hidden = true;
    stateHost.hidden = true;
    footer.el.hidden = true;
    detailHost.hidden = false;
  }

  function showListView() {
    detailHost.hidden = true;
    toolbar.el.hidden = false;
    bodyHost.hidden = false;
    stateHost.hidden = false;
    footer.el.hidden = false;
  }

  /** 返回语义：恢复进入前的滚动位置与触发卡片焦点。 */
  function closeDetailView() {
    detailOpen = false;
    lastGameKey = '';
    lightbox?.close({ restoreFocus: false });
    const trigger = lastTrigger;
    lastTrigger = null;
    showListView();
    // instant：页面 CSS 的 scroll-behavior: smooth 会把 auto 变成动画滚动，恢复必须落位精确。
    window.scrollTo({ top: savedScrollY, left: 0, behavior: 'instant' });
    // preventScroll：位置交给上面的恢复滚动，焦点只落卡片，不把视口拽走。
    if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    else (body?.focusFallback ?? body?.focusTitle)?.({ preventScroll: true });
  }

  /** 切页语义：静默隐藏详情，不恢复滚动与焦点。 */
  function hideDetailView() {
    detailOpen = false;
    lastGameKey = '';
    lastTrigger = null;
    lightbox?.close({ restoreFocus: false });
    showListView();
  }

  function createBody(kind) {
    if (kind === 'games') {
      return createGamesBody({
        onOpenGame: (game, trigger) => {
          lastTrigger = trigger;
          savedScrollY = window.scrollY;
          onOpenGame(game.id);
        },
      });
    }
    return createProseBody();
  }

  function renderReady(view, kind) {
    if (!body || body.kind !== kind || renderedDocId !== view.doc.id) {
      hideDetailView();
      body?.destroy();
      body = createBody(kind);
      renderedDocId = view.doc.id;
      bodyHost.replaceChildren(body.el);
    }

    bodyHost.hidden = false;
    stateHost.replaceChildren();
    footer.el.hidden = false;
    body.update({ doc: view.doc, toc: view.toc });

    if (kind !== 'games') return;

    if (view.game) {
      ensureDetailComponents();
      prevGame = view.prevGame;
      nextGame = view.nextGame;
      detail.update({
        game: view.game,
        gameIndex: view.gameIndex,
        gameCount: view.gameCount,
        chapterLabel: view.doc.no ? `第${view.doc.no}章` : docHeading(view.doc),
        prev: view.prevGame,
        next: view.nextGame,
      });

      const gameKey = `${view.doc.id}/${view.game.id}`;
      if (!detailOpen || lastGameKey !== gameKey) {
        detailOpen = true;
        lastGameKey = gameKey;
        showDetailView();
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        detail.focusTitle();
      }
    } else if (detailOpen) {
      closeDetailView();
    }
  }

  function renderPending(view) {
    hideDetailView();
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
    prevDocRef = view.prev ?? null;
    nextDocRef = view.next ?? null;
    toolbar.update({ prev: prevDocRef, next: nextDocRef });
    footer.update({ prev: prevDocRef, next: nextDocRef });

    if (view.status === 'ready' && view.doc) {
      renderReady(view, view.kind ?? view.doc.kind);
      return;
    }
    renderPending(view);
  }

  function onKeydown(event) {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    if (lightbox?.isOpen()) return;

    const target = event.target;
    if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) {
      return;
    }

    if (detailOpen) {
      if (event.key === 'ArrowLeft' && prevGame) {
        event.preventDefault();
        onSwitchGame(prevGame.id);
      } else if (event.key === 'ArrowRight' && nextGame) {
        event.preventDefault();
        onSwitchGame(nextGame.id);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        onBackGame();
      }
      return;
    }

    if (event.key === 'ArrowLeft' && prevDocRef) {
      event.preventDefault();
      onPrev(prevDocRef.id);
    } else if (event.key === 'ArrowRight' && nextDocRef) {
      event.preventDefault();
      onNext(nextDocRef.id);
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
    },
  };
}
