import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BUDGET, MAX_GAMES_PER_CHAPTER } from './budgets.mjs';
import { validateDataset } from './extract-games.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = join(ROOT, 'data');
const TOC_PATH = join(DATA_DIR, 'toc.json');
const DOC_DIRS = ['chapters', 'docs'];

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

function main() {
  const toc = readJSON(TOC_PATH, 'data/toc.json');
  if (!toc) {
    for (const error of errors) console.error(`✗ ${error}`);
    process.exit(2);
  }

  checkSize(TOC_PATH, BUDGET.toc, 'data/toc.json');

  if (!Array.isArray(toc.docs) || !Array.isArray(toc.groups) || !Array.isArray(toc.gameIndex)) {
    fail('目录缺少 docs / groups / gameIndex');
    for (const error of errors) console.error(`✗ ${error}`);
    process.exit(1);
  }

  const docs = [];
  const referenced = new Set();
  for (const entry of toc.docs) {
    if (!entry?.file) {
      fail(`目录条目 ${entry?.id ?? '??'} 缺少 file`);
      continue;
    }
    referenced.add(entry.file);
    const path = join(DATA_DIR, entry.file);
    const doc = readJSON(path, `${entry.id} 文档数据`);
    if (!doc) continue;
    checkSize(path, BUDGET.doc, `${entry.id} 文档数据`);
    if (doc.id !== entry.id) fail(`${entry.id}：文件内 id=${doc.id}`);
    if (doc.kind === 'games' && doc.games.length > MAX_GAMES_PER_CHAPTER) {
      fail(`${entry.id}：游戏数超过 ${MAX_GAMES_PER_CHAPTER}，需要重新评估分页`);
    }
    docs.push(doc);
  }

  const games = docs.flatMap((doc) => doc.games ?? []);
  errors.push(...validateDataset({
    toc,
    docs,
    games,
    artworkExists: (path) => existsSync(join(ROOT, path)),
  }));

  for (const dir of DOC_DIRS) {
    const full = join(DATA_DIR, dir);
    if (!existsSync(full)) {
      fail(`缺少数据目录 data/${dir}`);
      continue;
    }
    for (const name of readdirSync(full)) {
      if (!name.endsWith('.json')) continue;
      if (referenced.has(`${dir}/${name}`)) continue;
      fail(`孤儿数据文件：data/${dir}/${name} 未被目录引用`);
    }
  }

  if (errors.length > 0) {
    for (const error of errors) console.error(`✗ ${error}`);
    console.error(`\n${errors.length} 个错误，发布门禁未通过`);
    process.exit(1);
  }

  const proseDocs = docs.filter((doc) => doc.kind === 'prose');
  const blockCount = proseDocs.reduce((sum, doc) => sum + doc.blocks.length, 0);
  const checklistItems = proseDocs.reduce(
    (sum, doc) => sum + doc.blocks.filter((block) => block.type === 'checklist')
      .reduce((count, block) => count + block.items.length, 0),
    0,
  );
  const tableCount = proseDocs.reduce((sum, doc) => sum + doc.blocks.filter((block) => block.type === 'table').length, 0);

  console.log(`✓ 目录  ${toc.docs.length} 个文档 / ${toc.groups.length} 个分组 / ${toc.gameIndex.length} 个索引`);
  console.log(`✓ 文档  ${docs.length} 个文件 / ${games.length} 条游戏`);
  console.log(`✓ 正文  ${proseDocs.length} 个文字章 / ${blockCount} 块 / ${tableCount} 张表 / ${checklistItems} 项清单`);
  console.log('✓ 结构  分组覆盖、表格列宽、有序列表 start、清单项、小节与标题一致');
  console.log(`✓ 体积  toc ${(statSync(TOC_PATH).size / 1024).toFixed(1)} KB / 单文档 ≤ ${BUDGET.doc / 1024} KB`);
  console.log('✓ 索引  与文档内游戏逐条一致');
  console.log('✓ 清理  data/chapters 与 data/docs 无孤儿文件');
}

main();
