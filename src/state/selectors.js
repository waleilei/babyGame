import { groupChaptersByPart, searchGames, selectNeighbors } from '../domain/catalog.js';

export function selectTocView(state) {
  const toc = state.toc.data;
  if (!toc) {
    return {
      status: state.toc.status,
      error: state.toc.error,
      toc: null,
      parts: [],
      total: 0,
      chapterCount: 0,
      query: state.query,
      results: [],
      resultCount: 0,
    };
  }

  const results = searchGames(toc, state.query);
  return {
    status: 'ready',
    error: null,
    toc,
    parts: groupChaptersByPart(toc),
    total: toc.book?.total ?? toc.gameIndex.length,
    chapterCount: toc.book?.chapterCount ?? toc.chapters.length,
    query: state.query,
    results,
    resultCount: results.length,
  };
}

export function selectChapterView(state, no) {
  const toc = state.toc.data;
  const entry = state.chapters[no] ?? { status: 'idle', data: null, error: null };
  const { prev, next } = toc ? selectNeighbors(toc, no) : { prev: null, next: null };
  const route = state.route;
  const gameId = route?.name === 'chapter' && route.chapterNo === no ? route.gameId : null;
  const game = gameId ? (entry.data?.games ?? []).find((item) => item.id === gameId) ?? null : null;

  return { status: entry.status, error: entry.error, chapter: entry.data, toc, prev, next, gameId, game };
}
