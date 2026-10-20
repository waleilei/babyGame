import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildDataset, loadSource } from '../tools/extract-games.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIR = process.env.BOOK_DIR
  ? resolve(process.env.BOOK_DIR)
  : resolve(ROOT, '../books/0-3-game-book');
const ABILITIES = new Set(['大运动', '精细动作', '语言沟通', '认知探索', '社会情绪', '生活自理']);
const hasSource = existsSync(join(SOURCE_DIR, 'manuscript/ch05-08.md'));

test('数据管线从真实稿件产出 2 篇 14 章 130 条游戏', { skip: !hasSource }, () => {
  const dataset = buildDataset({ sourceDir: SOURCE_DIR });

  assert.deepEqual(dataset.errors, []);
  assert.equal(dataset.toc.book.total, 130);
  assert.equal(dataset.toc.book.chapterCount, 14);
  assert.equal(dataset.toc.chapters.length, 14);
  assert.equal(dataset.toc.gameIndex.length, 130);
  assert.equal(dataset.games.length, 130);

  assert.deepEqual(
    dataset.toc.parts.map((part) => part.no),
    [2, 3],
  );
  assert.deepEqual(
    dataset.toc.parts[0].chapterNos,
    [5, 6, 7, 8, 9, 10, 11, 12],
  );
  assert.deepEqual(dataset.toc.parts[1].chapterNos, [13, 14, 15, 16, 17, 18]);
  assert.equal(dataset.toc.parts[0].title, '分月龄游戏图鉴');
  assert.equal(dataset.toc.parts[1].title, '把游戏放进生活');

  const ids = dataset.games.map((game) => game.id);
  assert.deepEqual(ids, Array.from({ length: 130 }, (_, index) => String(index + 1).padStart(2, '0')));
  assert.equal(new Set(ids).size, 130);

  for (const chapter of dataset.toc.chapters) {
    assert.ok(chapter.title.length > 0, `第${chapter.no}章缺标题`);
    assert.ok(chapter.shortTitle.length > 0, `第${chapter.no}章缺短标题`);
    assert.ok(chapter.age.length > 0, `第${chapter.no}章缺月龄`);
    assert.match(chapter.file, /^chapters\/ch\d{2}\.json$/);
    assert.equal(chapter.count, dataset.chapters.find((item) => item.no === chapter.no).games.length);
  }

  assert.equal(dataset.toc.chapters.find((item) => item.no === 5).age, '0-3月');
  assert.equal(dataset.toc.chapters.find((item) => item.no === 12).age, '31-36月');
  assert.equal(dataset.toc.chapters.find((item) => item.no === 13).age, '生活场景');
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

test('目录索引与章节内游戏逐条一致', { skip: !hasSource }, () => {
  const dataset = buildDataset({ sourceDir: SOURCE_DIR });
  const indexed = new Map(dataset.toc.gameIndex.map((entry) => [`${entry.chapterNo}:${entry.id}`, entry]));

  assert.equal(indexed.size, 130);
  for (const chapter of dataset.chapters) {
    for (const game of chapter.games) {
      const entry = indexed.get(`${chapter.no}:${game.id}`);
      assert.ok(entry, `第${chapter.no}章 ${game.id} 不在目录索引中`);
      assert.equal(entry.name, game.name);
      assert.equal(entry.age, game.age);
      assert.equal(entry.ability, game.ability);
    }
  }
});

test('章节导语解析为段落与列表块', { skip: !hasSource }, () => {
  const dataset = buildDataset({ sourceDir: SOURCE_DIR });
  const chapter5 = dataset.chapters.find((item) => item.no === 5);
  assert.equal(chapter5.intro[0].type, 'p');
  assert.equal(chapter5.intro[0].text, '**发展地图**');
  assert.equal(chapter5.intro[1].type, 'ul');
  assert.ok(chapter5.intro[1].items.length >= 3);

  const chapter13 = dataset.chapters.find((item) => item.no === 13);
  assert.equal(chapter13.intro[0].type, 'p');
  assert.match(chapter13.intro[0].text, /^\*\*场景说明\*\*：/);
});

test('提交的数据产物与重新提取结果一致', { skip: !hasSource }, () => {
  const dataset = buildDataset({ sourceDir: SOURCE_DIR });
  const tocFile = join(ROOT, 'data/toc.json');
  assert.ok(existsSync(tocFile), '缺少 data/toc.json，请先运行 npm run data');

  const committedToc = JSON.parse(readFileSync(tocFile, 'utf8'));
  const { generatedAt: _generated, ...committedRest } = committedToc;
  const { generatedAt: _next, ...freshRest } = dataset.toc;
  assert.deepEqual(committedRest, freshRest);

  for (const chapter of dataset.chapters) {
    const file = join(ROOT, 'data', `chapters/ch${String(chapter.no).padStart(2, '0')}.json`);
    assert.ok(existsSync(file), `缺少 ${file}`);
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), chapter);
  }
});

test('三份源稿件可独立解析', { skip: !hasSource }, () => {
  const first = loadSource({ sourceDir: SOURCE_DIR, file: 'manuscript/ch05-08.md' });
  const second = loadSource({ sourceDir: SOURCE_DIR, file: 'manuscript/ch09-12.md' });
  const third = loadSource({ sourceDir: SOURCE_DIR, file: 'manuscript/ch13-18.md' });

  assert.equal(first.chapters.length, 4);
  assert.equal(second.chapters.length, 4);
  assert.equal(third.chapters.length, 6);
  assert.equal(first.partNo, 2);
  assert.equal(second.partNo, 2);
  assert.equal(third.partNo, 3);
});
