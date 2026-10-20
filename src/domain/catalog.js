

export function groupChaptersByPart(toc) {
  const byNo = new Map((toc?.chapters ?? []).map((chapter) => [chapter.no, chapter]));
  return (toc?.parts ?? []).map((part) => ({
    no: part.no,
    title: part.title,
    chapterNos: [...part.chapterNos],
    chapters: part.chapterNos.map((no) => byNo.get(no)).filter(Boolean),
  }));
}

export function selectNeighbors(toc, no) {
  const chapters = toc?.chapters ?? [];
  const index = chapters.findIndex((chapter) => chapter.no === no);
  if (index < 0) return { prev: null, next: null };
  return {
    prev: index > 0 ? chapters[index - 1] : null,
    next: index < chapters.length - 1 ? chapters[index + 1] : null,
  };
}

export function searchGames(toc, query) {
  const needle = String(query ?? '').trim().toLowerCase();
  if (!needle) return [];
  return (toc?.gameIndex ?? []).filter((game) => game.name.toLowerCase().includes(needle));
}
