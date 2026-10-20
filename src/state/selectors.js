import { groupDocs, searchCatalog, selectNeighbors } from '../domain/catalog.js';

export function selectTocView(state) {
  const toc = state.toc.data;
  if (!toc) {
    return {
      status: state.toc.status,
      error: state.toc.error,
      toc: null,
      groups: [],
      total: 0,
      chapterCount: 0,
      docCount: 0,
      query: state.query,
      results: [],
      resultCount: 0,
    };
  }

  const results = searchCatalog(toc, state.query);
  return {
    status: 'ready',
    error: null,
    toc,
    groups: groupDocs(toc),
    total: toc.book?.total ?? toc.gameIndex.length,
    chapterCount: toc.book?.chapterCount ?? 0,
    docCount: toc.book?.docCount ?? toc.docs.length,
    query: state.query,
    results,
    resultCount: results.length,
  };
}

export function selectDocView(state, docId) {
  const toc = state.toc.data;
  const entry = state.docs[docId] ?? { status: 'idle', data: null, error: null };
  const { prev, next } = toc ? selectNeighbors(toc, docId) : { prev: null, next: null };
  const route = state.route;
  const routeGameId = route?.name === 'doc' && route.docId === docId ? route.gameId : null;
  const tocEntry = (toc?.docs ?? []).find((doc) => doc.id === docId) ?? null;
  const kind = tocEntry?.kind ?? entry.data?.kind ?? null;
  const games = kind === 'games' ? (entry.data?.games ?? []) : [];
  const found = routeGameId ? games.findIndex((item) => item.id === routeGameId) : -1;
  const game = found >= 0 ? games[found] : null;

  return {
    status: entry.status,
    error: entry.error,
    kind,
    doc: entry.data,
    toc,
    entry: tocEntry,
    prev,
    next,
    gameId: routeGameId,
    game,
    // 详情视图派生：章内 1 起的序号与上/下一个游戏；详情未打开或游戏不存在时为 null。
    gameIndex: found >= 0 ? found + 1 : null,
    gameCount: kind === 'games' ? games.length : null,
    prevGame: found > 0 ? games[found - 1] : null,
    nextGame: found >= 0 && found < games.length - 1 ? games[found + 1] : null,
  };
}
