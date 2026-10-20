import { AppError, getJSON, toAppError } from './http.js';

const joinUrl = (base, path) => `${String(base).replace(/\/+$/, '')}/${String(path).replace(/^\/+/, '')}`;

function assertToc(toc) {
  if (!toc || toc.schemaVersion !== 1) {
    throw new AppError('SCHEMA', '目录数据版本不支持', { retryable: false });
  }
  if (!toc.book || !Array.isArray(toc.parts) || !Array.isArray(toc.chapters) || !Array.isArray(toc.gameIndex)) {
    throw new AppError('SCHEMA', '目录数据结构不完整', { retryable: false });
  }
  if (toc.chapters.some((chapter) => !Number.isInteger(chapter?.no) || !chapter?.file)) {
    throw new AppError('SCHEMA', '目录缺少章节信息', { retryable: false });
  }
}

function assertChapter(chapter, no) {
  if (!chapter || chapter.schemaVersion !== 1 || chapter.no !== no) {
    throw new AppError('SCHEMA', '章节数据版本或编号不匹配', { retryable: false });
  }
  if (!Array.isArray(chapter.intro) || !Array.isArray(chapter.games)) {
    throw new AppError('SCHEMA', '章节数据结构不完整', { retryable: false });
  }
}

export function createCatalogRepository({ baseUrl = './data', fetchImpl = globalThis.fetch } = {}) {
  let tocPromise = null;
  const chapterCache = new Map();

  function getToc() {
    if (!tocPromise) {
      tocPromise = getJSON(joinUrl(baseUrl, 'toc.json'), { fetchImpl })
        .then((toc) => {
          assertToc(toc);
          return toc;
        })
        .catch((error) => {
          tocPromise = null;
          throw toAppError(error);
        });
    }
    return tocPromise;
  }

  function getChapter(no) {
    const key = Number(no);
    if (!Number.isInteger(key) || key <= 0) {
      return Promise.reject(new AppError('SCHEMA', '章节号无效', { retryable: false }));
    }

    if (!chapterCache.has(key)) {
      const promise = getToc()
        .then((toc) => {
          const entry = toc.chapters.find((chapter) => chapter.no === key);
          if (!entry) throw new AppError('SCHEMA', `第${key}章不在目录中`, { retryable: false });
          return getJSON(joinUrl(baseUrl, entry.file), { fetchImpl });
        })
        .then((chapter) => {
          assertChapter(chapter, key);
          return chapter;
        })
        .catch((error) => {
          chapterCache.delete(key);
          throw toAppError(error);
        });
      chapterCache.set(key, promise);
    }

    return chapterCache.get(key);
  }

  function prefetchChapter(no) {
    void getChapter(no).catch(() => {});
  }

  return { getToc, getChapter, prefetchChapter };
}
