
export function resultCountLabel(count) {
  return count === 0 ? '没有找到匹配的游戏' : `找到 ${count} 个游戏`;
}

export function chapterHeading(chapter) {
  return `第${chapter.no}章 ${chapter.title}`;
}

export function chapterButtonLabel(chapter) {
  return `第${chapter.no}章 ${chapter.shortTitle}`;
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
