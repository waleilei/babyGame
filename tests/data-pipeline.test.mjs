import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildDataset, loadSource, validateBlocks } from '../tools/extract-games.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIR = process.env.BOOK_DIR
  ? resolve(process.env.BOOK_DIR)
  : resolve(ROOT, '../books/0-3-game-book');
const ABILITIES = new Set(['大运动', '精细动作', '语言沟通', '认知探索', '社会情绪', '生活自理']);
const hasSource = existsSync(join(SOURCE_DIR, 'manuscript/front-matter.md'));

const EXPECTED_IDS = [
  'front',
  ...Array.from({ length: 21 }, (_, index) => `ch${String(index + 1).padStart(2, '0')}`),
  ...Array.from({ length: 6 }, (_, index) => `apx-${String.fromCharCode(97 + index)}`),
];

const docById = (dataset, id) => dataset.docs.find((doc) => doc.id === id);

test('数据管线从真实稿件产出 28 个文档、21 章、6 附录、130 个游戏', { skip: !hasSource }, () => {
  const dataset = buildDataset({ sourceDir: SOURCE_DIR });

  assert.deepEqual(dataset.errors, []);
  assert.equal(dataset.toc.schemaVersion, 2);
  assert.equal(dataset.toc.book.total, 130);
  assert.equal(dataset.toc.book.chapterCount, 21);
  assert.equal(dataset.toc.book.docCount, 28);
  assert.equal(dataset.docs.length, 28);
  assert.deepEqual(dataset.toc.docs.map((doc) => doc.id), EXPECTED_IDS);
  assert.deepEqual(dataset.toc.groups.map((group) => group.docIds.length), [1, 4, 8, 6, 3, 6]);
  assert.deepEqual(
    dataset.toc.groups.flatMap((group) => group.docIds),
    EXPECTED_IDS,
  );
  assert.deepEqual(dataset.toc.groups.map((group) => group.id), [
    'front', 'part-1', 'part-2', 'part-3', 'part-4', 'appendix',
  ]);
  assert.equal(dataset.games.length, 130);
});

test('章节类型：第 5-18 章是游戏章，其余是文字章', { skip: !hasSource }, () => {
  const dataset = buildDataset({ sourceDir: SOURCE_DIR });

  for (const entry of dataset.toc.docs) {
    const isGameChapter = /^ch(0[5-9]|1[0-8])$/.test(entry.id);
    assert.equal(entry.kind, isGameChapter ? 'games' : 'prose', entry.id);
    assert.equal(entry.count, isGameChapter ? docById(dataset, entry.id).games.length : 0, entry.id);
    assert.ok(entry.title.length > 0, `${entry.id} 缺标题`);
    assert.ok(entry.shortTitle.length > 0, `${entry.id} 缺短标题`);
    assert.ok(entry.meta.length > 0, `${entry.id} 缺 meta`);
    assert.ok(entry.file.endsWith('.json'), `${entry.id} 缺 file`);
  }

  for (const entry of dataset.toc.docs) {
    const doc = docById(dataset, entry.id);
    if (entry.kind === 'prose') {
      assert.ok(doc.blocks.length > 0, `${entry.id} 没有正文块`);
      assert.deepEqual(validateBlocks(doc.blocks, entry.id), [], `${entry.id} 块结构非法`);
      assert.equal(doc.sections.length, doc.blocks.filter((block) => block.type.startsWith('h')).length);
      assert.equal(doc.games, undefined);
    } else {
      assert.ok(doc.intro.length > 0, `${entry.id} 缺章首导语`);
      assert.equal(doc.blocks, undefined);
    }
  }

  assert.equal(dataset.toc.docs.find((doc) => doc.id === 'ch01').file, 'chapters/ch01.json');
  assert.equal(dataset.toc.docs.find((doc) => doc.id === 'front').file, 'docs/front.json');
  assert.equal(dataset.toc.docs.find((doc) => doc.id === 'apx-a').file, 'docs/apx-a.json');
});

test('每条游戏 8 个模块齐全、步骤 4 条、观察 2-3 条', { skip: !hasSource }, () => {
  const dataset = buildDataset({ sourceDir: SOURCE_DIR });

  for (const game of dataset.games) {
    const label = `${game.id} ${game.name}`;
    for (const field of ['age', 'ability', 'duration', 'place', 'materials', 'people', 'play', 'up', 'down', 'safety', 'question']) {
      assert.ok(game[field] && game[field].length > 0, `${label} 缺少 ${field}`);
    }
    assert.ok(ABILITIES.has(game.ability), `${label} 能力非法：${game.ability}`);
    assert.equal(game.steps.length, 4, `${label} 步骤不是 4 条`);
    assert.ok(game.observe.length >= 2 && game.observe.length <= 3, `${label} 观察条数异常`);
    assert.ok(game.ageRange.min < game.ageRange.max, `${label} 月龄区间异常`);
    assert.match(game.art.main, /^assets\/art\/panel_web\/\d{3}-1\.jpg$/);
    assert.equal(game.art.panels.length, 4, `${label} 步骤图不是 4 张`);
    assert.deepEqual(
      game.art.panels,
      [1, 2, 3, 4].map((n) => game.art.main.replace(/-1\.jpg$/, `-${n}.jpg`)),
    );
    for (const panel of game.art.panels) {
      assert.ok(existsSync(join(SOURCE_DIR, panel)), `${label} 缺步骤图 ${panel}`);
    }
  }
});

test('目录索引以 docId 关联文档，并保留章号', { skip: !hasSource }, () => {
  const dataset = buildDataset({ sourceDir: SOURCE_DIR });
  const indexed = new Map(dataset.toc.gameIndex.map((entry) => [`${entry.docId}:${entry.id}`, entry]));

  assert.equal(indexed.size, 130);
  for (const doc of dataset.docs) {
    for (const game of doc.games ?? []) {
      const entry = indexed.get(`${doc.id}:${game.id}`);
      assert.ok(entry, `${doc.id} ${game.id} 不在目录索引中`);
      assert.equal(entry.name, game.name);
      assert.equal(entry.age, game.age);
      assert.equal(entry.ability, game.ability);
      assert.equal(entry.chapterNo, doc.no);
    }
  }
});

test('游戏章导语保持 p + ul 的形状，不升级伪标题', { skip: !hasSource }, () => {
  const dataset = buildDataset({ sourceDir: SOURCE_DIR });
  const chapter5 = docById(dataset, 'ch05');
  assert.equal(chapter5.intro[0].type, 'p');
  assert.equal(chapter5.intro[0].text, '**发展地图**');
  assert.equal(chapter5.intro[1].type, 'ul');
  assert.ok(chapter5.intro[1].items.length >= 3);

  const chapter13 = docById(dataset, 'ch13');
  assert.equal(chapter13.intro[0].type, 'p');
  assert.match(chapter13.intro[0].text, /^\*\*场景说明\*\*：/);
});

test('前置：三个 ## 标题成为 h2 块与小节，合成一个文档', { skip: !hasSource }, () => {
  const dataset = buildDataset({ sourceDir: SOURCE_DIR });
  const front = docById(dataset, 'front');

  assert.equal(front.no, null);
  assert.equal(front.title, '前置｜序、使用说明、发展地图');
  assert.deepEqual(
    front.blocks.filter((block) => block.type === 'h2').map((block) => block.text),
    ['序　0-3岁，你才是孩子最好的玩具', '本书使用说明', '0-36个月发展地图'],
  );
  assert.deepEqual(front.sections.map((section) => section.level), [2, 2, 2]);
  assert.ok(front.blocks.some((block) => block.type === 'table'));
});

test('伪标题升级：整段加粗升级为 h4，带句末标点的保留为段落', { skip: !hasSource }, () => {
  const dataset = buildDataset({ sourceDir: SOURCE_DIR });
  const chapter1 = docById(dataset, 'ch01');

  assert.ok(chapter1.blocks.some((block) => block.type === 'h4' && block.text === '机制一：重复，把动作变成能力'));
  const kept = chapter1.blocks.find((block) => block.type === 'p' && block.text.startsWith('**第一，学习是'));
  assert.ok(kept, '带句号的整段加粗应保留为段落');
  assert.ok(!chapter1.blocks.some((block) => block.type === 'h4' && block.text.endsWith('。')));

  const proseDocs = dataset.docs.filter((doc) => doc.kind === 'prose');
  const h4Count = proseDocs.reduce(
    (sum, doc) => sum + doc.blocks.filter((block) => block.type === 'h4').length,
    0,
  );
  const boldOnlyCount = proseDocs.reduce(
    (sum, doc) => sum + doc.blocks.filter(
      (block) => block.type === 'h4' || (block.type === 'p' && /^\*\*[^*]+\*\*$/.test(block.text)),
    ).length,
    0,
  );

  // 当前稿件 183 处整段加粗，其中 176 处满足升级条件，7 处因句末标点保留为段落。
  assert.equal(boldOnlyCount, 183);
  assert.equal(h4Count, 176);
});

test('附录基线：B 的 37 项清单、17 张表、最宽 5 列、D/E 跨块编号、E 童谣换行', { skip: !hasSource }, () => {
  const dataset = buildDataset({ sourceDir: SOURCE_DIR });
  const appendixDocs = dataset.docs.filter((doc) => doc.partId === 'appendix');
  assert.equal(appendixDocs.length, 6);

  const checklist = docById(dataset, 'apx-b').blocks.filter((block) => block.type === 'checklist');
  assert.equal(checklist.length, 6);
  assert.equal(checklist.reduce((sum, block) => sum + block.items.length, 0), 37);

  const tables = appendixDocs.flatMap((doc) => doc.blocks.filter((block) => block.type === 'table'));
  // 附录 A-D 共 13 张（7+1+4+1）；E/F 追加 4 张，合计 17 张。
  const tablesAD = appendixDocs
    .filter((doc) => /^apx-[a-d]$/.test(doc.id))
    .flatMap((doc) => doc.blocks.filter((block) => block.type === 'table'));
  assert.equal(tablesAD.length, 13);
  assert.equal(tables.length, 17);
  assert.equal(Math.max(...tables.map((table) => table.head.length)), 5);
  for (const table of tables) {
    for (const row of table.rows) assert.equal(row.length, table.head.length);
  }

  const appendixD = docById(dataset, 'apx-d');
  const bookOls = [];
  for (const block of appendixD.blocks.filter((item) => item.type === 'ol')) {
    if (bookOls.length > 0 && block.start === 1) break;
    bookOls.push(block);
  }
  const bookNumbers = bookOls.flatMap(
    (block) => block.items.map((_, index) => block.start + index),
  );
  assert.deepEqual(bookNumbers, Array.from({ length: 50 }, (_, index) => index + 1));

  const appendixE = docById(dataset, 'apx-e');
  const songNumbers = appendixE.blocks
    .filter((block) => block.type === 'ol')
    .slice(0, 3)
    .flatMap((block) => block.items.map((_, index) => block.start + index));
  assert.deepEqual(songNumbers, Array.from({ length: 30 }, (_, index) => index + 1));

  const poem = appendixE.blocks.find((block) => block.type === 'p' && block.text.startsWith('点点虫，虫虫飞'));
  assert.ok(poem, '缺少《点点虫》童谣段落');
  assert.equal(poem.text.split('\n').length, 4);
});

test('提交的数据产物与重新提取结果一致，且没有孤儿文件', { skip: !hasSource }, () => {
  const dataset = buildDataset({ sourceDir: SOURCE_DIR });
  const tocFile = join(ROOT, 'data/toc.json');
  assert.ok(existsSync(tocFile), '缺少 data/toc.json，请先运行 npm run data');

  const committedToc = JSON.parse(readFileSync(tocFile, 'utf8'));
  const { generatedAt: _generated, ...committedRest } = committedToc;
  const { generatedAt: _next, ...freshRest } = dataset.toc;
  assert.deepEqual(committedRest, freshRest);

  const expected = new Map(dataset.toc.docs.map((entry) => [entry.file, docById(dataset, entry.id)]));
  for (const [file, doc] of expected) {
    const path = join(ROOT, 'data', file);
    assert.ok(existsSync(path), `缺少 ${file}`);
    assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), doc);
  }

  for (const dir of ['chapters', 'docs']) {
    for (const name of readdirSync(join(ROOT, 'data', dir))) {
      assert.ok(expected.has(`${dir}/${name}`), `孤儿数据文件 data/${dir}/${name}`);
    }
  }
});

test('八份源稿件可独立解析', { skip: !hasSource }, () => {
  const cases = [
    ['manuscript/front-matter.md', 'front', 1],
    ['manuscript/part1-ch01-02.md', 'prose', 2],
    ['manuscript/part1-ch03-04.md', 'prose', 2],
    ['manuscript/ch05-08.md', 'games', 4],
    ['manuscript/ch09-12.md', 'games', 4],
    ['manuscript/ch13-18.md', 'games', 6],
    ['manuscript/part4-ch19-21.md', 'prose', 3],
    ['manuscript/appendix.md', 'appendix', 6],
  ];

  for (const [file, mode, count] of cases) {
    const result = loadSource({ sourceDir: SOURCE_DIR, file, mode });
    assert.deepEqual(result.errors, [], file);
    assert.equal(result.docs.length, count, file);
  }
});
