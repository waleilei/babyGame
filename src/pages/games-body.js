import { el } from '../core/dom.js';
import { docHeading } from '../domain/format.js';
import { createGameGrid } from '../ui/game-grid.js';
import { createIntro } from '../ui/intro.js';

/**
 * 游戏章正文：页头、章首导语、游戏卡片网格。
 * 工具栏、页脚、详情视图与大图的全部权归文档页外壳。
 */
export function createGamesBody({ onOpenGame }) {
  const title = el('h1', { class: 'chapter__title', tabindex: '-1' });
  const meta = el('p', { class: 'chapter__meta' });
  const introHost = el('div', { class: 'chapter__intro-host' });
  const gridHost = el('div', { class: 'chapter__grid-host' });
  const root = el('div', { class: 'chapter' }, [title, meta, introHost, gridHost]);

  let docId = '';
  let gridTitle = null;

  return {
    el: root,
    kind: 'games',

    update({ doc }) {
      if (doc.id === docId) return;
      docId = doc.id;
      title.textContent = docHeading(doc);
      meta.textContent = `${doc.meta} · ${doc.games.length} 个游戏`;

      if (doc.intro.length > 0) introHost.replaceChildren(createIntro(doc.intro));
      else introHost.replaceChildren();

      const grid = createGameGrid(doc.games, { onOpen: onOpenGame });
      gridTitle = grid.title;
      gridHost.replaceChildren(grid.el);
    },

    focusTitle: () => title.focus({ preventScroll: true }),
    focusFallback: () => {
      if (gridTitle?.isConnected) gridTitle.focus({ preventScroll: true });
      else title.focus({ preventScroll: true });
    },
    destroy() {},
  };
}
