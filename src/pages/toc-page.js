import { el } from '../core/dom.js';
import { createErrorBlock, createSkeleton } from '../ui/states.js';
import { createSearchBox } from '../ui/search-box.js';
import { createSearchResults } from '../ui/search-results.js';
import { createTocList } from '../ui/toc-list.js';

export function createTocPage({ onSearch, onClearSearch, onRetry }) {
  const title = el('h1', { class: 'toc-hero__title', tabindex: '-1', text: '0-3岁亲子游戏图鉴' });
  const subtitle = el('p', { class: 'toc-hero__subtitle', text: '130个游戏，把日常变成早教' });
  const count = el('p', { class: 'toc-hero__count' });
  const hero = el('header', { class: 'toc-hero' }, [
    el('p', { class: 'toc-hero__eyebrow', text: 'babyGame · 按章浏览' }),
    title,
    subtitle,
    count,
  ]);

  function clearSearch() {
    search.clear();
    onClearSearch();
  }

  const search = createSearchBox({ onInput: onSearch, onClear: clearSearch });
  const resultsHost = el('div', { class: 'toc-page__results' });
  const tocHost = el('div', { class: 'toc-page__toc' });
  const root = el('div', { class: 'toc-page' }, [hero, search.el, resultsHost, tocHost]);

  let tocRendered = false;
  let lastStatus = 'idle';

  function update(view) {
    if (view.status === 'ready') {
      hero.hidden = false;
      title.textContent = view.toc.book.title;
      subtitle.textContent = view.toc.book.subtitle;
      count.textContent = `${view.total} 个游戏 · ${view.chapterCount} 章`;
      search.el.hidden = false;
      search.update({ resultCount: view.resultCount });

      if (!tocRendered) {
        tocHost.replaceChildren(createTocList(view.parts));
        tocRendered = true;
      }

      resultsHost.replaceChildren(
        createSearchResults({ query: view.query, results: view.results, onClear: clearSearch }),
      );
      tocHost.hidden = view.query.trim().length > 0;
      lastStatus = 'ready';
      return;
    }

    hero.hidden = false;
    search.el.hidden = true;
    resultsHost.replaceChildren();
    tocHost.hidden = false;

    if (view.status === 'error') {
      tocRendered = false;
      hero.hidden = true;
      tocHost.replaceChildren(createErrorBlock({ title: '目录加载失败', error: view.error, onRetry }));
      lastStatus = 'error';
      return;
    }

    if (lastStatus !== 'loading') tocHost.replaceChildren(createSkeleton('toc'));
    lastStatus = 'loading';
  }

  update({ status: 'idle' });

  return {
    el: root,
    update,
    focusTitle: () => title.focus({ preventScroll: true }),
    destroy() {},
  };
}
