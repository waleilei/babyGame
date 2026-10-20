
export function resolveRoute(route, toc) {
  const toToc = { route: { name: 'toc' }, notice: null };
  if (!route) return { ...toToc, notice: '页面地址无效，已回到目录' };
  if (route.name === 'toc') return toToc;

  const chapter = (toc?.chapters ?? []).find((item) => item.no === route.chapterNo);
  if (!chapter) {
    return { route: { name: 'toc' }, notice: `第${route.chapterNo}章不存在，已回到目录` };
  }

  if (route.gameId) {
    const found = (toc?.gameIndex ?? []).some(
      (item) => item.chapterNo === route.chapterNo && item.id === route.gameId,
    );
    if (!found) {
      return {
        route: { name: 'chapter', chapterNo: route.chapterNo, gameId: null },
        notice: `游戏 ${route.gameId} 不存在，已回到本章`,
      };
    }
  }

  return {
    route: { name: 'chapter', chapterNo: route.chapterNo, gameId: route.gameId ?? null },
    notice: null,
  };
}
