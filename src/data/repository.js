import { AppError, getJSON, toAppError } from './http.js';

const joinUrl = (base, path) => `${String(base).replace(/\/+$/, '')}/${String(path).replace(/^\/+/, '')}`;

function assertToc(toc) {
  if (!toc || toc.schemaVersion !== 2) {
    throw new AppError('SCHEMA', '目录数据版本不支持', { retryable: false });
  }
  if (!toc.book || !Array.isArray(toc.groups) || !Array.isArray(toc.docs) || !Array.isArray(toc.gameIndex)) {
    throw new AppError('SCHEMA', '目录数据结构不完整', { retryable: false });
  }
  if (toc.docs.some((doc) => !doc?.id || !doc?.file || !doc?.kind)) {
    throw new AppError('SCHEMA', '目录缺少文档信息', { retryable: false });
  }
}

function assertDoc(doc, docId) {
  if (!doc || doc.schemaVersion !== 2 || doc.id !== docId) {
    throw new AppError('SCHEMA', '文档数据版本或编号不匹配', { retryable: false });
  }
  if (doc.kind === 'games') {
    if (!Array.isArray(doc.intro) || !Array.isArray(doc.games)) {
      throw new AppError('SCHEMA', '游戏章数据结构不完整', { retryable: false });
    }
    return;
  }
  if (doc.kind === 'prose') {
    if (!Array.isArray(doc.blocks) || !Array.isArray(doc.sections)) {
      throw new AppError('SCHEMA', '文字章数据结构不完整', { retryable: false });
    }
    return;
  }
  throw new AppError('SCHEMA', '文档类型不支持', { retryable: false });
}

export function createCatalogRepository({ baseUrl = './data', fetchImpl = globalThis.fetch } = {}) {
  let tocPromise = null;
  const docCache = new Map();

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

  function getDoc(docId) {
    const key = String(docId ?? '');
    if (!key) return Promise.reject(new AppError('SCHEMA', '文档 id 无效', { retryable: false }));

    if (!docCache.has(key)) {
      const promise = getToc()
        .then((toc) => {
          const entry = toc.docs.find((doc) => doc.id === key);
          if (!entry) throw new AppError('SCHEMA', `文档 ${key} 不在目录中`, { retryable: false });
          return getJSON(joinUrl(baseUrl, entry.file), { fetchImpl });
        })
        .then((doc) => {
          assertDoc(doc, key);
          return doc;
        })
        .catch((error) => {
          docCache.delete(key);
          throw toAppError(error);
        });
      docCache.set(key, promise);
    }

    return docCache.get(key);
  }

  function prefetchDoc(docId) {
    void getDoc(docId).catch(() => {});
  }

  return { getToc, getDoc, prefetchDoc };
}
