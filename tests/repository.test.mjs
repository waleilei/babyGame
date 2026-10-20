import test from 'node:test';
import assert from 'node:assert/strict';

import { createCatalogRepository } from '../src/data/repository.js';

const TOC = {
  schemaVersion: 2,
  bookVersion: 'v1.4',
  book: { title: '0-3岁亲子游戏图鉴', subtitle: '', total: 130, chapterCount: 21, docCount: 28 },
  groups: [
    { id: 'front', title: '前置', docIds: ['front'] },
    { id: 'part-2', no: 2, title: '分月龄游戏图鉴', docIds: ['ch05', 'ch06'] },
  ],
  docs: [
    { id: 'front', no: null, kind: 'prose', title: '前置｜序、使用说明、发展地图', shortTitle: '序、使用说明、发展地图', meta: '阅读', count: 0, file: 'docs/front.json' },
    { id: 'ch05', no: 5, kind: 'games', title: '0-3个月｜躺着的世界', shortTitle: '躺着的世界', meta: '0-3月', count: 1, file: 'chapters/ch05.json' },
    { id: 'ch06', no: 6, kind: 'games', title: '4-6个月｜翻身与抓握', shortTitle: '翻身与抓握', meta: '4-6月', count: 1, file: 'chapters/ch06.json' },
  ],
  gameIndex: [
    { id: '01', name: '黑白卡追视', docId: 'ch05', chapterNo: 5, age: '0-3月', ability: '认知探索' },
    { id: '11', name: '翻身引诱', docId: 'ch06', chapterNo: 6, age: '4-6月', ability: '大运动' },
  ],
};

const FRONT = {
  schemaVersion: 2,
  id: 'front',
  no: null,
  kind: 'prose',
  title: '前置｜序、使用说明、发展地图',
  partId: 'front',
  meta: '阅读',
  blocks: [{ type: 'p', text: '写这本书的起因。' }],
  sections: [],
};

const CHAPTER_5 = {
  schemaVersion: 2,
  id: 'ch05',
  no: 5,
  kind: 'games',
  title: '0-3个月｜躺着的世界',
  partId: 'part-2',
  meta: '0-3月',
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
      art: { main: 'assets/art/panel_web/001-1.jpg', panels: ['1', '2', '3', '4'] },
    },
  ],
};

const CHAPTER_6 = {
  ...CHAPTER_5,
  id: 'ch06',
  no: 6,
  title: '4-6个月｜翻身与抓握',
  games: [{ ...CHAPTER_5.games[0], id: '11', name: '翻身引诱' }],
};

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
  './data/docs/front.json': FRONT,
};

test('目录与文档按 file 字段组装 URL', async () => {
  const { fetchImpl, calls } = fakeFetch(URLS);
  const repository = createCatalogRepository({ baseUrl: './data', fetchImpl });

  assert.deepEqual(await repository.getToc(), TOC);
  assert.deepEqual(await repository.getDoc('ch05'), CHAPTER_5);
  assert.deepEqual(await repository.getDoc('front'), FRONT);
  assert.deepEqual(calls, [
    './data/toc.json',
    './data/chapters/ch05.json',
    './data/docs/front.json',
  ]);
});

test('baseUrl 末尾斜杠不会产生双斜杠', async () => {
  const { fetchImpl, calls } = fakeFetch(URLS);
  const repository = createCatalogRepository({ baseUrl: './data/', fetchImpl });

  await repository.getDoc('ch05');
  assert.deepEqual(calls, ['./data/toc.json', './data/chapters/ch05.json']);
});

test('并发请求去重：三个相同的文档请求只发一次 toc 与一次文档请求', async () => {
  const { fetchImpl, calls } = fakeFetch(URLS);
  const repository = createCatalogRepository({ baseUrl: './data', fetchImpl });

  const [a, b, c] = await Promise.all([
    repository.getDoc('ch05'),
    repository.getDoc('ch05'),
    repository.getDoc('ch05'),
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
  await repository.getDoc('ch05');
  await repository.getDoc('ch05');
  await repository.getDoc('front');
  await repository.getDoc('front');

  assert.deepEqual(calls, [
    './data/toc.json',
    './data/chapters/ch05.json',
    './data/docs/front.json',
  ]);
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

  await assert.rejects(repository.getDoc('ch05'), (error) => {
    assert.equal(error.code, 'HTTP');
    assert.equal(error.status, 500);
    assert.equal(error.retryable, true);
    return true;
  });

  assert.deepEqual(await repository.getDoc('ch05'), CHAPTER_5);
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

test('目录版本或结构不符归一为 SCHEMA，且不写入缓存', async () => {
  const broken = { ...TOC, docs: undefined };
  const { fetchImpl, calls } = fakeFetch({ './data/toc.json': broken });
  const repository = createCatalogRepository({ baseUrl: './data', fetchImpl });

  await assert.rejects(repository.getToc(), (error) => {
    assert.equal(error.code, 'SCHEMA');
    return true;
  });
  await assert.rejects(repository.getToc(), (error) => error.code === 'SCHEMA');
  assert.equal(calls.length, 2);

  const v1 = fakeFetch({ './data/toc.json': { ...TOC, schemaVersion: 1 } });
  const legacy = createCatalogRepository({ baseUrl: './data', fetchImpl: v1.fetchImpl });
  await assert.rejects(legacy.getToc(), (error) => error.code === 'SCHEMA');
});

test('文档不在目录中直接 SCHEMA，不发起文档请求', async () => {
  const { fetchImpl, calls } = fakeFetch(URLS);
  const repository = createCatalogRepository({ baseUrl: './data', fetchImpl });

  await assert.rejects(repository.getDoc('apx-a'), (error) => {
    assert.equal(error.code, 'SCHEMA');
    return true;
  });
  assert.deepEqual(calls, ['./data/toc.json']);
});

test('文档 id 或版本不一致判为 SCHEMA', async () => {
  const mismatched = fakeFetch({ ...URLS, './data/chapters/ch05.json': { ...CHAPTER_5, id: 'ch06' } });
  const repository = createCatalogRepository({ baseUrl: './data', fetchImpl: mismatched.fetchImpl });
  await assert.rejects(repository.getDoc('ch05'), (error) => error.code === 'SCHEMA');

  const legacy = fakeFetch({ ...URLS, './data/chapters/ch05.json': { ...CHAPTER_5, schemaVersion: 1 } });
  const legacyRepository = createCatalogRepository({ baseUrl: './data', fetchImpl: legacy.fetchImpl });
  await assert.rejects(legacyRepository.getDoc('ch05'), (error) => error.code === 'SCHEMA');

  const proseWithoutBlocks = fakeFetch({ ...URLS, './data/docs/front.json': { ...FRONT, blocks: undefined } });
  const proseRepository = createCatalogRepository({ baseUrl: './data', fetchImpl: proseWithoutBlocks.fetchImpl });
  await assert.rejects(proseRepository.getDoc('front'), (error) => error.code === 'SCHEMA');
});

test('预热只发请求并暖缓存，失败静默', async () => {
  let fail = true;
  const { fetchImpl, calls } = fakeFetch({
    ...URLS,
    './data/chapters/ch06.json': () => (fail ? response(null, { status: 500 }) : response(CHAPTER_6)),
  });
  const repository = createCatalogRepository({ baseUrl: './data', fetchImpl });

  repository.prefetchDoc('ch06');
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(calls.includes('./data/chapters/ch06.json'));

  fail = false;
  assert.deepEqual(await repository.getDoc('ch06'), CHAPTER_6);
  assert.equal(calls.length, 3, '失败后预热未缓存，应重新请求');
});

test('预热成功后文档命中缓存，不再请求', async () => {
  const { fetchImpl, calls } = fakeFetch(URLS);
  const repository = createCatalogRepository({ baseUrl: './data', fetchImpl });

  repository.prefetchDoc('ch06');
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(await repository.getDoc('ch06'), CHAPTER_6);
  assert.deepEqual(calls, ['./data/toc.json', './data/chapters/ch06.json']);
});

test('预热返回值不是 Promise，调用方无需处理', () => {
  const { fetchImpl } = fakeFetch(URLS);
  const repository = createCatalogRepository({ baseUrl: './data', fetchImpl });
  assert.equal(repository.prefetchDoc('ch06'), undefined);
});
