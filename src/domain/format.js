
export function resultCountLabel(count) {
  return count === 0 ? '没有找到匹配的游戏' : `找到 ${count} 个游戏`;
}

export function chapterHeading(chapter) {
  return `第${chapter.no}章 ${chapter.title}`;
}

export function chapterButtonLabel(chapter) {
  return `第${chapter.no}章 ${chapter.shortTitle}`;
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
