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
  const game = routeGameId && kind === 'games'
    ? (entry.data?.games ?? []).find((item) => item.id === routeGameId) ?? null
    : null;

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
  };
}
