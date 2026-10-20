import test from 'node:test';
import assert from 'node:assert/strict';

import { createCatalogRepository } from '../src/data/repository.js';

const TOC = {
  schemaVersion: 1,
  bookVersion: 'v1.4',
  book: { title: '0-3岁亲子游戏图鉴', subtitle: '', total: 130, chapterCount: 14 },
  parts: [{ no: 2, title: '分月龄游戏图鉴', chapterNos: [5, 6] }],
  chapters: [
    { no: 5, title: '0-3个月｜躺着的世界', shortTitle: '躺着的世界', age: '0-3月', count: 1, file: 'chapters/ch05.json' },
    { no: 6, title: '4-6个月｜翻身与抓握', shortTitle: '翻身与抓握', age: '4-6月', count: 1, file: 'chapters/ch06.json' },
  ],
  gameIndex: [
    { id: '01', name: '黑白卡追视', chapterNo: 5, age: '0-3月', ability: '认知探索' },
    { id: '11', name: '翻身引诱', chapterNo: 6, age: '4-6月', ability: '大运动' },
  ],
};

const CHAPTER_5 = {
  schemaVersion: 1,
  no: 5,
  title: '0-3个月｜躺着的世界',
  partNo: 2,
  age: '0-3月',
  kind: 'games',
  intro: [{ type: 'p', text: '**发展地图**' }],
  games: [
    {
      id: '01',
      name: '黑白卡追视',
      age: '0-3月',
      ageRange: { min: 0, max: 3 },
      ability: '认知探索',
      duration: '3-5分钟',
      place: '床/地垫',
      materials: '黑白卡3-5张',
      people: '1对1',
      play: '让眼睛追着走。',
      steps: ['a', 'b', 'c', 'd'],
      observe: ['x', 'y'],
      up: '换卡',
      down: '静止',
      safety: '不反光',
      question: '不看怎么办',
      art: { main: 'assets/ill/001.svg', panels: ['1', '2', '3', '4'] },
    },
  ],
};

const CHAPTER_6 = { ...CHAPTER_5, no: 6, title: '4-6个月｜翻身与抓握', games: [{ ...CHAPTER_5.games[0], id: '11', name: '翻身引诱' }] };

function response(body, { status = 200, jsonError = null } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (jsonError) throw new Error(jsonError);
      return body;
    },
  };
}

function fakeFetch(resolvers) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    const resolver = resolvers[url];
    if (typeof resolver === 'function') return resolver(calls.filter((item) => item === url).length);
    if (resolver instanceof Error) throw resolver;
    if (resolver === undefined) return response(null, { status: 404 });
    if (resolver && typeof resolver === 'object' && 'ok' in resolver) return resolver;
    return response(resolver);
  };
  return { fetchImpl, calls };
}

const URLS = {
  './data/toc.json': TOC,
  './data/chapters/ch05.json': CHAPTER_5,
  './data/chapters/ch06.json': CHAPTER_6,
};

test('目录与章节按相对路径组装 URL', async () => {
  const { fetchImpl, calls } = fakeFetch(URLS);
  const repository = createCatalogRepository({ baseUrl: './data', fetchImpl });

  assert.deepEqual(await repository.getToc(), TOC);
  assert.deepEqual(await repository.getChapter(5), CHAPTER_5);
  assert.deepEqual(calls, ['./data/toc.json', './data/chapters/ch05.json']);
});

test('baseUrl 末尾斜杠不会产生双斜杠', async () => {
  const { fetchImpl, calls } = fakeFetch(URLS);
  const repository = createCatalogRepository({ baseUrl: './data/', fetchImpl });

  await repository.getChapter(5);
  assert.deepEqual(calls, ['./data/toc.json', './data/chapters/ch05.json']);
});

test('并发请求去重：三个相同的章节请求只发一次 toc 与一次章节请求', async () => {
  const { fetchImpl, calls } = fakeFetch(URLS);
  const repository = createCatalogRepository({ baseUrl: './data', fetchImpl });

  const [a, b, c] = await Promise.all([
    repository.getChapter(5),
    repository.getChapter(5),
    repository.getChapter(5),
  ]);
  assert.equal(a, b);
  assert.equal(b, c);
  assert.deepEqual(calls, ['./data/toc.json', './data/chapters/ch05.json']);
});

test('成功结果常驻缓存，重复进入不产生新请求', async () => {
  const { fetchImpl, calls } = fakeFetch(URLS);
  const repository = createCatalogRepository({ baseUrl: './data', fetchImpl });

  await repository.getToc();
  await repository.getToc();
  await repository.getChapter(5);
  await repository.getChapter(5);
  await repository.getChapter(5);

  assert.deepEqual(calls, ['./data/toc.json', './data/chapters/ch05.json']);
});

test('失败不缓存：第一次失败后重试可成功', async () => {
  let attempts = 0;
  const { fetchImpl, calls } = fakeFetch({
    ...URLS,
    './data/chapters/ch05.json': () => {
      attempts += 1;
      if (attempts === 1) return response(null, { status: 500 });
      return response(CHAPTER_5);
    },
  });
  const repository = createCatalogRepository({ baseUrl: './data', fetchImpl });

  await assert.rejects(repository.getChapter(5), (error) => {
    assert.equal(error.code, 'HTTP');
    assert.equal(error.status, 500);
    assert.equal(error.retryable, true);
    return true;
  });

  assert.deepEqual(await repository.getChapter(5), CHAPTER_5);
  assert.deepEqual(calls, [
    './data/toc.json',
    './data/chapters/ch05.json',
    './data/chapters/ch05.json',
  ]);
});

test('网络失败归一为 NETWORK 且可重试', async () => {
  const { fetchImpl } = fakeFetch({ ...URLS, './data/toc.json': new TypeError('Failed to fetch') });
  const repository = createCatalogRepository({ baseUrl: './data', fetchImpl });

  await assert.rejects(repository.getToc(), (error) => {
    assert.equal(error.code, 'NETWORK');
    assert.equal(error.retryable, true);
    return true;
  });
});

test('404 归一为 HTTP 且不可重试', async () => {
  const { fetchImpl } = fakeFetch({ './data/toc.json': response(null, { status: 404 }) });
  const repository = createCatalogRepository({ baseUrl: './data', fetchImpl });

  await assert.rejects(repository.getToc(), (error) => {
    assert.equal(error.code, 'HTTP');
    assert.equal(error.status, 404);
    assert.equal(error.retryable, false);
    return true;
  });
});

test('坏 JSON 归一为 PARSE', async () => {
  const { fetchImpl } = fakeFetch({ './data/toc.json': response(null, { jsonError: 'Unexpected token' }) });
  const repository = createCatalogRepository({ baseUrl: './data', fetchImpl });

  await assert.rejects(repository.getToc(), (error) => {
    assert.equal(error.code, 'PARSE');
    assert.equal(error.retryable, false);
    return true;
  });
});

test('结构缺失归一为 SCHEMA，且不写入缓存', async () => {
  const broken = { ...TOC, chapters: undefined };
  const { fetchImpl, calls } = fakeFetch({ './data/toc.json': broken });
  const repository = createCatalogRepository({ baseUrl: './data', fetchImpl });

  await assert.rejects(repository.getToc(), (error) => {
    assert.equal(error.code, 'SCHEMA');
    return true;
  });
  await assert.rejects(repository.getToc(), (error) => error.code === 'SCHEMA');
  assert.equal(calls.length, 2);
});

test('章节号不在目录中直接 SCHEMA，不发起章节请求', async () => {
  const { fetchImpl, calls } = fakeFetch(URLS);
  const repository = createCatalogRepository({ baseUrl: './data', fetchImpl });

  await assert.rejects(repository.getChapter(99), (error) => {
    assert.equal(error.code, 'SCHEMA');
    return true;
  });
  assert.deepEqual(calls, ['./data/toc.json']);
});

test('章节文件章号与请求不一致判为 SCHEMA', async () => {
  const { fetchImpl } = fakeFetch({ ...URLS, './data/chapters/ch05.json': { ...CHAPTER_5, no: 6 } });
  const repository = createCatalogRepository({ baseUrl: './data', fetchImpl });

  await assert.rejects(repository.getChapter(5), (error) => {
    assert.equal(error.code, 'SCHEMA');
    return true;
  });
});

test('预热只发请求并暖缓存，失败静默', async () => {
  let fail = true;
  const { fetchImpl, calls } = fakeFetch({
    ...URLS,
    './data/chapters/ch06.json': () => (fail ? response(null, { status: 500 }) : response(CHAPTER_6)),
  });
  const repository = createCatalogRepository({ baseUrl: './data', fetchImpl });

  repository.prefetchChapter(6);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(calls.includes('./data/chapters/ch06.json'));

  fail = false;
  assert.deepEqual(await repository.getChapter(6), CHAPTER_6);
  const countAfterRetry = calls.length;
  assert.equal(countAfterRetry, 3, '失败后预热未缓存，应重新请求');
});

test('预热成功后章节命中缓存，不再请求', async () => {
  const { fetchImpl, calls } = fakeFetch(URLS);
  const repository = createCatalogRepository({ baseUrl: './data', fetchImpl });

  repository.prefetchChapter(6);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(await repository.getChapter(6), CHAPTER_6);
  assert.deepEqual(calls, ['./data/toc.json', './data/chapters/ch06.json']);
});

test('预热返回值不是 Promise，调用方无需处理', () => {
  const { fetchImpl } = fakeFetch(URLS);
  const repository = createCatalogRepository({ baseUrl: './data', fetchImpl });
  assert.equal(repository.prefetchChapter(6), undefined);
});
