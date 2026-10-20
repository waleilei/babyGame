import { afterIdle } from './core/idle.js';
import { createRouter, parseHash } from './core/router.js';
import { createStore } from './core/store.js';
import { showToast } from './core/toast.js';
import { createCatalogRepository } from './data/repository.js';
import { selectNeighbors } from './domain/catalog.js';
import { docLabel } from './domain/format.js';
import { resolveRoute } from './domain/route.js';
import { createDocPage } from './pages/doc-page.js';
import { createTocPage } from './pages/toc-page.js';
import { selectDocView, selectTocView } from './state/selectors.js';
import { createInitialState } from './state/store.js';

const viewRoot = document.getElementById('view');
// 滚动全部显式管理：列表 ⇄ 详情的滚动记录/恢复、切页回顶部都由页面驱动，
// 不让浏览器在 hash 导航后异步恢复 push 时刻的滚动位置。
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
const store = createStore(createInitialState(parseHash(location.hash) ?? { name: 'toc' }));
const repository = createCatalogRepository({ baseUrl: './data' });
const prefetchEnabled = new URLSearchParams(location.search).get('prefetch') !== 'off';

let currentPage = null;
let currentPageKey = '';
let focusedKey = '';
let navToken = 0;
let tocRequest = null;
let cancelPrefetch = null;
// 详情页返回语义：从列表进入时用浏览器后退（可回列表）；
// 深链直接进入（无列表历史）时返回按钮替换当前历史项去列表。刷新后重置为深链语义。
let enteredGameFromList = false;

const setDoc = (docId, entry) => store.setState((state) => ({
  docs: { ...state.docs, [docId]: entry },
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

async function loadDoc(docId) {
  const existing = store.getState().docs[docId];
  if (existing?.status === 'ready') return schedulePrefetch(docId);
  if (existing?.status === 'loading') return;

  setDoc(docId, { status: 'loading', data: null, error: null });
  try {
    const data = await repository.getDoc(docId);

    setDoc(docId, { status: 'ready', data, error: null });
    if (store.getState().route?.docId === docId) schedulePrefetch(docId);
  } catch (error) {
    setDoc(docId, { status: 'error', data: null, error });
  }
}

function schedulePrefetch(docId) {
  if (!prefetchEnabled) return;
  cancelWarmup();
  cancelPrefetch = afterIdle(() => {
    cancelPrefetch = null;
    const toc = store.getState().toc.data;
    if (!toc) return;
    const { prev, next } = selectNeighbors(toc, docId);
    if (prev) repository.prefetchDoc(prev.id);
    if (next) repository.prefetchDoc(next.id);
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
    if (resolved.route.name === 'doc') await loadDoc(resolved.route.docId);
  } catch (error) {
    if (token === navToken && rawRoute.name === 'doc') {
      setDoc(rawRoute.docId, { status: 'error', data: null, error });
    }
  }
}

const retryToc = () => void handleRoute(store.getState().route);

function retryDoc(docId) {
  store.setState((state) => {
    const docs = { ...state.docs };
    delete docs[docId];
    return { docs };
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

  const docId = route.docId;
  return createDocPage({
    onHome: () => router.navigate({ name: 'toc' }),
    onPrev: (id) => router.navigate({ name: 'doc', docId: id, gameId: null }),
    onNext: (id) => router.navigate({ name: 'doc', docId: id, gameId: null }),
    onOpenGame: (id) => {
      enteredGameFromList = true;
      router.navigate({ name: 'doc', docId, gameId: id });
    },
    onBackGame: () => {
      if (enteredGameFromList) {
        enteredGameFromList = false;
        window.history.back();
        return;
      }
      router.navigate({ name: 'doc', docId, gameId: null }, { replace: true });
    },
    // 详情内切游戏替换当前历史项：浏览器后退一次就回到列表，不逐游戏入栈。
    onSwitchGame: (id) => router.navigate({ name: 'doc', docId, gameId: id }, { replace: true }),
    onRetry: () => retryDoc(docId),
  });
}

function render() {
  const state = store.getState();
  const route = state.route;
  if (!route) return;

  const pageKey = route.name === 'toc' ? 'toc' : `doc:${route.docId}`;
  if (pageKey !== currentPageKey) {
    currentPage?.destroy();
    currentPage = createPage(route);
    viewRoot.replaceChildren(currentPage.el);
    currentPageKey = pageKey;
    focusedKey = '';
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
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

  const view = selectDocView(state, route.docId);
  currentPage.update(view);
  document.title = view.doc && view.entry
    ? `${view.game ? `${view.game.name} · ` : ''}${docLabel(view.entry)} · ${view.toc?.book?.title ?? 'babyGame'}`
    : '正在加载文档 · babyGame';

  if (view.status === 'ready' && focusedKey !== pageKey) {
    focusedKey = pageKey;
    if (!view.game) currentPage.focusTitle();
  }
}

const router = createRouter({ onRoute: handleRoute });

store.subscribe(render);
router.start();
