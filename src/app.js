import { afterIdle } from './core/idle.js';
import { createRouter, parseHash } from './core/router.js';
import { createStore } from './core/store.js';
import { showToast } from './core/toast.js';
import { createCatalogRepository } from './data/repository.js';
import { selectNeighbors } from './domain/catalog.js';
import { resolveRoute } from './domain/route.js';
import { createChapterPage } from './pages/chapter-page.js';
import { createTocPage } from './pages/toc-page.js';
import { selectChapterView, selectTocView } from './state/selectors.js';
import { createInitialState } from './state/store.js';

const viewRoot = document.getElementById('view');
const store = createStore(createInitialState(parseHash(location.hash) ?? { name: 'toc' }));
const repository = createCatalogRepository({ baseUrl: './data' });
const prefetchEnabled = new URLSearchParams(location.search).get('prefetch') !== 'off';

let currentPage = null;
let currentPageKey = '';
let focusedKey = '';
let navToken = 0;
let tocRequest = null;
let cancelPrefetch = null;

const setChapter = (no, entry) => store.setState((state) => ({
  chapters: { ...state.chapters, [no]: entry },
}));

function requestToc() {
  const current = store.getState().toc;
  if (current.status === 'ready') return Promise.resolve(current.data);
  if (tocRequest) return tocRequest;

  store.setState({ toc: { status: 'loading', data: null, error: null } });
  tocRequest = repository.getToc()
    .then((data) => {
      store.setState({ toc: { status: 'ready', data, error: null } });
      return data;
    })
    .catch((error) => {
      store.setState({ toc: { status: 'error', data: null, error } });
      throw error;
    })
    .finally(() => {
      tocRequest = null;
    });
  return tocRequest;
}

async function loadChapter(no) {
  const existing = store.getState().chapters[no];
  if (existing?.status === 'ready') return schedulePrefetch(no);
  if (existing?.status === 'loading') return;

  setChapter(no, { status: 'loading', data: null, error: null });
  try {
    const data = await repository.getChapter(no);

    setChapter(no, { status: 'ready', data, error: null });
    if (store.getState().route?.chapterNo === no) schedulePrefetch(no);
  } catch (error) {
    setChapter(no, { status: 'error', data: null, error });
  }
}

function schedulePrefetch(no) {
  if (!prefetchEnabled) return;
  cancelWarmup();
  cancelPrefetch = afterIdle(() => {
    cancelPrefetch = null;
    const toc = store.getState().toc.data;
    if (!toc) return;
    const { prev, next } = selectNeighbors(toc, no);
    if (prev) repository.prefetchChapter(prev.no);
    if (next) repository.prefetchChapter(next.no);
  }, 1000);
}

function cancelWarmup() {
  cancelPrefetch?.();
  cancelPrefetch = null;
}

async function handleRoute(rawRoute) {
  if (!rawRoute) {
    showToast('页面地址无效，已回到目录');
    router.navigate({ name: 'toc' }, { replace: true });
    return;
  }

  const token = ++navToken;
  cancelWarmup();
  store.setState({ route: rawRoute, ...(rawRoute.name !== 'toc' ? { query: '' } : {}) });

  try {
    const toc = await requestToc();
    if (token !== navToken) return;
    const resolved = resolveRoute(rawRoute, toc);
    if (resolved.notice) {
      showToast(resolved.notice);
      router.navigate(resolved.route, { replace: true });
      return;
    }
    if (rawRoute.name === 'chapter') await loadChapter(rawRoute.chapterNo);
  } catch (error) {
    if (token === navToken && rawRoute.name === 'chapter') {
      setChapter(rawRoute.chapterNo, { status: 'error', data: null, error });
    }
  }
}

const retryToc = () => void handleRoute(store.getState().route);

function retryChapter(no) {
  store.setState((state) => {
    const chapters = { ...state.chapters };
    delete chapters[no];
    return { chapters };
  });
  void handleRoute(store.getState().route);
}

const handleSearch = (query) => store.setState({ query });

function createPage(route) {
  if (route.name === 'toc') {
    return createTocPage({
      onSearch: handleSearch,
      onClearSearch: () => handleSearch(''),
      onRetry: retryToc,
    });
  }

  return createChapterPage({
    onHome: () => router.navigate({ name: 'toc' }),
    onPrev: (no) => router.navigate({ name: 'chapter', chapterNo: no, gameId: null }),
    onNext: (no) => router.navigate({ name: 'chapter', chapterNo: no, gameId: null }),
    onOpenGame: (id) => router.navigate({ name: 'chapter', chapterNo: route.chapterNo, gameId: id }),
    onCloseGame: () => router.navigate(
      { name: 'chapter', chapterNo: route.chapterNo, gameId: null },
      { replace: true },
    ),
    onRetry: () => retryChapter(route.chapterNo),
  });
}

function render() {
  const state = store.getState();
  const route = state.route;
  if (!route) return;

  const pageKey = route.name === 'toc' ? 'toc' : `chapter:${route.chapterNo}`;
  if (pageKey !== currentPageKey) {
    currentPage?.destroy();
    currentPage = createPage(route);
    viewRoot.replaceChildren(currentPage.el);
    currentPageKey = pageKey;
    focusedKey = '';
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }

  if (route.name === 'toc') {
    const view = selectTocView(state);
    currentPage.update(view);
    document.title = view.status === 'ready'
      ? `${view.toc.book.title} · ${view.total}个游戏`
      : 'babyGame · 亲子游戏';
    if (view.status === 'ready' && focusedKey !== pageKey) {
      currentPage.focusTitle();
      focusedKey = pageKey;
    }
    return;
  }

  const view = selectChapterView(state, route.chapterNo);
  currentPage.update(view);
  const chapter = view.chapter;
  const entry = view.toc?.chapters?.find((item) => item.no === chapter?.no);
  document.title = chapter
    ? `第${chapter.no}章 ${entry?.shortTitle ?? chapter.title} · ${view.toc?.book?.title ?? 'babyGame'}`
    : '正在加载章节 · babyGame';

  if (view.status === 'ready' && focusedKey !== pageKey) {
    focusedKey = pageKey;
    if (!view.game) currentPage.focusTitle();
  }
}

const router = createRouter({ onRoute: handleRoute });

store.subscribe(render);
router.start();
