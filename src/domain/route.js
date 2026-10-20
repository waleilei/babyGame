function missingDocNotice(docId) {
  const chapter = /^ch(\d+)$/.exec(String(docId ?? ''));
  if (chapter) return `第${Number(chapter[1])}章不存在，已回到目录`;

  const appendix = /^apx-([a-z])$/.exec(String(docId ?? ''));
  if (appendix) return `附录 ${appendix[1].toUpperCase()} 不存在，已回到目录`;

  return '文档不存在，已回到目录';
}

export function resolveRoute(route, toc) {
  const toToc = { route: { name: 'toc' }, notice: null };
  if (!route) return { ...toToc, notice: '页面地址无效，已回到目录' };
  if (route.name === 'toc') return toToc;

  const doc = (toc?.docs ?? []).find((item) => item.id === route.docId);
  if (!doc) {
    return { route: { name: 'toc' }, notice: missingDocNotice(route.docId) };
  }

  if (route.gameId) {
    if (doc.kind !== 'games') {
      return {
        route: { name: 'doc', docId: doc.id, gameId: null },
        notice: '本文档没有游戏详情，已回到文档开头',
      };
    }
    const found = (toc?.gameIndex ?? []).some(
      (item) => item.docId === doc.id && item.id === route.gameId,
    );
    if (!found) {
      return {
        route: { name: 'doc', docId: doc.id, gameId: null },
        notice: `游戏 ${route.gameId} 不存在，已回到本章`,
      };
    }
  }

  return {
    route: { name: 'doc', docId: doc.id, gameId: route.gameId ?? null },
    notice: null,
  };
}
