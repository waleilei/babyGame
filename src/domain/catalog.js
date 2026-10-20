function matchRank(value, needle) {
  const text = String(value ?? '').toLowerCase();
  if (!text) return -1;
  if (text === needle) return 0;
  if (text.startsWith(needle)) return 1;
  if (text.includes(needle)) return 2;
  return -1;
}

export function groupDocs(toc) {
  const byId = new Map((toc?.docs ?? []).map((doc) => [doc.id, doc]));
  return (toc?.groups ?? []).map((group) => ({
    id: group.id,
    no: group.no ?? null,
    title: group.title,
    docs: (group.docIds ?? []).map((id) => byId.get(id)).filter(Boolean),
  }));
}

export function selectNeighbors(toc, docId) {
  const docs = toc?.docs ?? [];
  const index = docs.findIndex((doc) => doc.id === docId);
  if (index < 0) return { prev: null, next: null };
  return {
    prev: index > 0 ? docs[index - 1] : null,
    next: index < docs.length - 1 ? docs[index + 1] : null,
  };
}

/**
 * 搜索 130 个游戏名与 28 个文档标题/短标题。
 * 排序：完全匹配 → 前缀匹配 → 包含匹配；同分按全书顺序；同一文档内游戏在文档之前。
 */
export function searchCatalog(toc, query) {
  const needle = String(query ?? '').trim().toLowerCase();
  if (!needle) return [];

  const docs = toc?.docs ?? [];
  const orderOf = new Map(docs.map((doc, index) => [doc.id, index]));
  const hits = [];

  for (const doc of docs) {
    const ranks = [matchRank(doc.title, needle), matchRank(doc.shortTitle, needle)].filter((rank) => rank >= 0);
    if (ranks.length === 0) continue;
    hits.push({
      kind: 'doc',
      docId: doc.id,
      docNo: doc.no,
      docKind: doc.kind,
      meta: doc.meta,
      title: doc.title,
      rank: Math.min(...ranks),
      order: orderOf.get(doc.id) ?? docs.length,
      tie: 1,
    });
  }

  for (const game of toc?.gameIndex ?? []) {
    const rank = matchRank(game.name, needle);
    if (rank < 0) continue;
    hits.push({
      kind: 'game',
      docId: game.docId,
      docNo: game.chapterNo,
      gameId: game.id,
      title: game.name,
      age: game.age,
      ability: game.ability,
      rank,
      order: orderOf.get(game.docId) ?? docs.length,
      tie: 0,
    });
  }

  hits.sort((a, b) => a.rank - b.rank || a.order - b.order || a.tie - b.tie);
  return hits;
}
