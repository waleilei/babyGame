const CN_NUMBERS = { 1: '一', 2: '二', 3: '三', 4: '四', 5: '五', 6: '六' };

/** 文档家族：前置 / 编号章 / 附录。目录条目与搜索命中都只有 id 或 docId。 */
export function docFamily(doc) {
  const id = String(doc?.id ?? doc?.docId ?? '');
  if (id === 'front') return 'front';
  if (/^apx-[a-f]$/.test(id)) return 'appendix';
  return 'chapter';
}

export function resultCountLabel(count) {
  return count === 0 ? '没有找到匹配的内容' : `找到 ${count} 条结果`;
}

export function groupLabel(group) {
  if (!group) return '';
  return group.no ? `第${CN_NUMBERS[group.no] ?? group.no}篇 ${group.title}` : group.title;
}

/** 导航按钮与页脚使用的文档标签。 */
export function docLabel(doc) {
  if (!doc) return '';
  const family = docFamily(doc);
  if (family === 'front') return `前置：${doc.shortTitle}`;
  if (family === 'appendix') {
    return `附录${String(doc.id ?? doc.docId).slice(-1).toUpperCase()} ${doc.shortTitle}`;
  }
  return `第${doc.no}章 ${doc.shortTitle}`;
}

/** 文档页 h1 与浏览器标题使用的完整标题。 */
export function docHeading(doc) {
  if (!doc) return '';
  if (docFamily(doc) !== 'chapter') return doc.title;
  return `第${doc.no}章 ${doc.title}`;
}

/** 目录行的图文徽标：游戏章「图文」，文字章/前置/附录「纯文字」，未知文档为空。 */
export function tocBadge(doc) {
  if (doc?.kind === 'games') return '图文';
  if (doc?.kind === 'prose') return '纯文字';
  return '';
}

/** 上一页 / 下一页按钮的文案，工具栏与页脚共用。 */
export function pagerText(doc, direction) {
  const isPrev = direction === 'prev';
  const label = doc ? docLabel(doc) : isPrev ? '已是第一页' : '已是最后一页';
  return {
    dir: isPrev ? '← 上一页' : '下一页 →',
    label,
    aria: doc
      ? `${isPrev ? '上一页' : '下一页'}：${label}`
      : isPrev ? '已经是第一页' : '已经是最后一页',
  };
}

/** 文字章页头的所属篇标签。 */
export function docPartLabel(doc, groups) {
  if (!doc) return '';
  const group = (groups ?? []).find((item) => item.id === doc.partId);
  return group ? groupLabel(group) : '';
}

export function searchHitTypeLabel(hit) {
  if (hit?.kind === 'game') return '游戏';
  const family = docFamily(hit);
  return family === 'front' ? '前置' : family === 'appendix' ? '附录' : '章节';
}

export function searchHitMeta(hit) {
  if (hit?.kind === 'game') return `${hit.age} · ${hit.ability}`;
  const family = docFamily(hit);
  return family === 'front' ? '前置' : family === 'appendix' ? '附录' : `第${hit?.docNo}章`;
}

export function searchEmptyTitle(query) {
  return `没有找到“${String(query ?? '').trim()}”`;
}

/**
 * 主图与步骤图的可访问名称。index 为 null 表示主图。
 * @param {{ name: string }} game
 * @param {number | null} [index]
 */
export function artAlt(game, index = null) {
  return index === null ? `${game.name}主图` : `${game.name}步骤图 ${index + 1}`;
}

/**
 * 打开大图按钮的可访问名称。
 * @param {{ name: string }} game
 * @param {number | null} [index]
 */
export function zoomButtonLabel(game, index = null) {
  return `放大${artAlt(game, index)}`;
}

export function errorMessage(error) {
  switch (error?.code) {
    case 'NETWORK':
      return '网络连接失败，请检查网络后重试。';
    case 'HTTP':
      return error.status === 404 ? '内容不存在，可能尚未发布。' : '服务器暂时无法响应，请稍后重试。';
    case 'PARSE':
      return '数据格式异常，无法显示内容。';
    case 'SCHEMA':
      return '数据不完整，暂时无法显示内容。';
    default:
      return '加载失败，请稍后重试。';
  }
}
