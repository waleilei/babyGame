import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BUDGET, MAX_GAMES_PER_CHAPTER } from './budgets.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = join(ROOT, 'data');
const TOC_PATH = join(DATA_DIR, 'toc.json');
const ABILITIES = new Set(['大运动', '精细动作', '语言沟通', '认知探索', '社会情绪', '生活自理']);
const REQUIRED_TEXT = ['name', 'age', 'ability', 'duration', 'place', 'materials', 'people', 'play', 'up', 'down', 'safety', 'question'];

const errors = [];

function fail(message) {
  errors.push(message);
}

function readJSON(path, label) {
  if (!existsSync(path)) {
    fail(`${label} 不存在：${path}`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`${label} 不是合法 JSON：${error.message}`);
    return null;
  }
}

function checkSize(path, limitBytes, label) {
  if (!existsSync(path)) return;
  const size = statSync(path).size;
  if (size > limitBytes) fail(`${label} 超过预算：${(size / 1024).toFixed(1)} KB > ${limitBytes / 1024} KB`);
}

function checkGame(game, chapterNo) {
  const label = `第${chapterNo}章 ${game?.id ?? '??'} ${game?.name ?? ''}`.trim();
  for (const field of REQUIRED_TEXT) {
    if (typeof game?.[field] !== 'string' || game[field].trim() === '') fail(`${label} 缺少 ${field}`);
  }
  if (!ABILITIES.has(game?.ability)) fail(`${label} 能力非法：${game?.ability}`);
  if (!game?.ageRange || !Number.isFinite(game.ageRange.min) || !Number.isFinite(game.ageRange.max) || game.ageRange.min >= game.ageRange.max) {
    fail(`${label} 月龄区间非法`);
  }
  if (!Array.isArray(game?.steps) || game.steps.length !== 4 || game.steps.some((step) => !step)) {
    fail(`${label} 步骤应为 4 条非空文本`);
  }
  if (!Array.isArray(game?.observe) || game.observe.length < 2 || game.observe.length > 3 || game.observe.some((item) => !item)) {
    fail(`${label} 观察应为 2-3 条非空文本`);
  }
  if (!game?.art?.main || !Array.isArray(game.art?.panels) || game.art.panels.length !== 4) {
    fail(`${label} 插画字段不完整`);
    return;
  }
  for (const artPath of [game.art.main, ...game.art.panels]) {
    if (!existsSync(join(ROOT, artPath))) fail(`${label} 缺少插画 ${artPath}`);
  }
}

function main() {
  const toc = readJSON(TOC_PATH, 'data/toc.json');
  if (!toc) {
    for (const error of errors) console.error(`✗ ${error}`);
    process.exit(2);
  }

  checkSize(TOC_PATH, BUDGET.toc, 'data/toc.json');
  if (toc.schemaVersion !== 1) fail(`toc.schemaVersion 应为 1，实际 ${toc.schemaVersion}`);
  if (toc.book?.total !== 130) fail(`book.total 应为 130，实际 ${toc.book?.total}`);
  if (toc.book?.chapterCount !== 14) fail(`book.chapterCount 应为 14，实际 ${toc.book?.chapterCount}`);
  if (!Array.isArray(toc.parts) || toc.parts.length !== 2) fail(`parts 应为 2 篇，实际 ${toc.parts?.length}`);
  if (!Array.isArray(toc.chapters) || toc.chapters.length !== 14) fail(`chapters 应为 14 章，实际 ${toc.chapters?.length}`);
  if (!Array.isArray(toc.gameIndex) || toc.gameIndex.length !== 130) fail(`gameIndex 应为 130 条，实际 ${toc.gameIndex?.length}`);

  const chapterNos = (toc.chapters ?? []).map((chapter) => chapter.no).sort((a, b) => a - b);
  const expectedNos = Array.from({ length: 14 }, (_, index) => index + 5);
  if (chapterNos.join(',') !== expectedNos.join(',')) fail(`章号应连续为 5-18，实际 ${chapterNos.join(',')}`);

  const chapters = [];
  const allGames = [];
  for (const entry of toc.chapters ?? []) {
    const path = join(DATA_DIR, entry.file);
    const chapter = readJSON(path, `第${entry.no}章数据`);
    if (!chapter) continue;
    checkSize(path, BUDGET.chapter, `第${entry.no}章数据`);

    chapters.push(chapter);
    if (chapter.no !== entry.no) fail(`第${entry.no}章文件内 no=${chapter.no}`);
    if (chapter.kind !== 'games') fail(`第${entry.no}章 kind 应为 games`);
    if (!Array.isArray(chapter.intro) || chapter.intro.length === 0) fail(`第${entry.no}章缺章首导语`);
    if (!Array.isArray(chapter.games)) {
      fail(`第${entry.no}章 games 不是数组`);
      continue;
    }
    if (entry.count !== chapter.games.length) fail(`第${entry.no}章游戏数不一致：目录 ${entry.count} / 数据 ${chapter.games.length}`);
    if (chapter.games.length > MAX_GAMES_PER_CHAPTER) fail(`第${entry.no}章游戏数超过 ${MAX_GAMES_PER_CHAPTER}，需要重新评估分页`);

    for (const game of chapter.games) {
      allGames.push(game);
      checkGame(game, entry.no);
    }
  }

  const seenIds = new Set();
  for (const game of allGames) {
    if (seenIds.has(game.id)) fail(`编号重复：${game.id}`);
    seenIds.add(game.id);
  }
  const sortedIds = [...seenIds].sort((a, b) => Number(a) - Number(b));
  const expectedIds = Array.from({ length: 130 }, (_, index) => String(index + 1).padStart(2, '0'));
  if (sortedIds.join(',') !== expectedIds.join(',')) {
    const missing = expectedIds.filter((id) => !seenIds.has(id));
    fail(`编号应连续覆盖 01-130，缺失：${missing.join(',') || '无'}`);
  }

  const indexByKey = new Map((toc.gameIndex ?? []).map((entry) => [`${entry.chapterNo}:${entry.id}`, entry]));
  for (const chapter of chapters) {
    for (const game of chapter.games) {
      const indexed = indexByKey.get(`${chapter.no}:${game.id}`);
      if (!indexed) {
        fail(`目录索引缺少第${chapter.no}章 ${game.id}`);
        continue;
      }
      for (const field of ['name', 'age', 'ability']) {
        if (indexed[field] !== game[field]) fail(`第${chapter.no}章 ${game.id} 的 ${field} 与目录索引不一致`);
      }
    }
  }

  if (errors.length > 0) {
    for (const error of errors) console.error(`✗ ${error}`);
    console.error(`\n${errors.length} 个错误，发布门禁未通过`);
    process.exit(1);
  }

  console.log(`✓ 目录  ${toc.chapters.length} 章 / ${toc.gameIndex.length} 个索引 / 2 篇`);
  console.log(`✓ 章节  ${chapters.length} 个文件 / ${allGames.length} 条游戏`);
  console.log(`✓ 字段  8 模块齐全 / 步骤 4 条 / 观察 2-3 条 / 能力枚举合法`);
  console.log(`✓ 资源  520 张步骤图存在（首张兼作主图）`);
  console.log(`✓ 体积  toc ${(statSync(TOC_PATH).size / 1024).toFixed(1)} KB / 单章 ≤ ${BUDGET.chapter / 1024} KB`);
  console.log(`✓ 索引  与章节内游戏逐条一致`);
}

main();
