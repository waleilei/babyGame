import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildDataset } from './extract-games.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_SOURCE_DIR = resolve(REPO_ROOT, '../books/0-3-game-book');
const JSON_ONLY = process.argv.includes('--json');

function orderedNumbers(doc, { limit = Infinity } = {}) {
  if (!doc) return [];
  const numbers = [];
  for (const block of doc.blocks.filter((item) => item.type === 'ol')) {
    if (numbers.length > 0 && block.start === 1) break;
    for (let index = 0; index < block.items.length; index += 1) numbers.push(block.start + index);
    if (numbers.length >= limit) break;
  }
  return numbers;
}

function collect(dataset) {
  const docs = dataset.docs;
  const proseDocs = docs.filter((doc) => doc.kind === 'prose');
  const tablesOf = (doc) => doc.blocks.filter((block) => block.type === 'table');
  const tables = proseDocs.flatMap(tablesOf);
  const tablesAD = proseDocs.filter((doc) => /^apx-[a-d]$/.test(doc.id)).flatMap(tablesOf);
  const tablesEF = proseDocs.filter((doc) => /^apx-[e-f]$/.test(doc.id)).flatMap(tablesOf);
  const checklists = proseDocs.flatMap((doc) => doc.blocks.filter((block) => block.type === 'checklist'));
  const h4 = proseDocs.reduce((sum, doc) => sum + doc.blocks.filter((block) => block.type === 'h4').length, 0);
  const boldOnly = proseDocs.reduce(
    (sum, doc) => sum + doc.blocks.filter(
      (block) => block.type === 'h4' || (block.type === 'p' && /^\*\*[^*]+\*\*$/.test(block.text)),
    ).length,
    0,
  );

  const dNumbers = orderedNumbers(docs.find((doc) => doc.id === 'apx-d'));
  const eDoc = docs.find((doc) => doc.id === 'apx-e');
  const eNumbers = orderedNumbers(eDoc, { limit: 30 });

  const range = (numbers) => (numbers.length === 0
    ? 'n/a'
    : `${numbers[0]}-${numbers[numbers.length - 1]} ${numbers.every((value, index) => value === index + 1) ? '连续' : '不连续'}`);

  return {
    source: dataset.toc.bookVersion,
    book: dataset.toc.book.title,
    docs: {
      total: docs.length,
      front: docs.filter((doc) => doc.id === 'front').length,
      chapters: docs.filter((doc) => doc.no !== null).length,
      appendices: docs.filter((doc) => doc.partId === 'appendix').length,
    },
    games: dataset.games.length,
    proseBlocks: proseDocs.reduce((sum, doc) => sum + doc.blocks.length, 0),
    tables: {
      total: tables.length,
      body: tables.length - tablesAD.length - tablesEF.length,
      ad: tablesAD.length,
      ef: tablesEF.length,
      maxColumns: tables.reduce((max, table) => Math.max(max, table.head.length), 0),
    },
    checklists: {
      groups: checklists.length,
      items: checklists.reduce((sum, block) => sum + block.items.length, 0),
    },
    pseudoHeadings: {
      total: boldOnly,
      upgraded: h4,
      keptAsParagraph: boldOnly - h4,
    },
    orderedLists: {
      appendixD: range(dNumbers),
      appendixE: range(eNumbers),
    },
  };
}

function main() {
  const sourceDir = process.env.BOOK_DIR ? resolve(process.env.BOOK_DIR) : DEFAULT_SOURCE_DIR;
  const dataset = buildDataset({ sourceDir });

  if (dataset.errors.length > 0) {
    for (const error of dataset.errors) console.error(`✗ ${error}`);
    console.error(`${dataset.errors.length} 个错误，无法生成基线`);
    process.exit(1);
  }

  const baseline = collect(dataset);

  if (JSON_ONLY) {
    console.log(JSON.stringify(baseline, null, 2));
    return;
  }

  console.log(`源目录    ${sourceDir}`);
  console.log(`书目      ${baseline.book} ${baseline.source}`);
  console.log(`文档      ${baseline.docs.total}（前置 ${baseline.docs.front} / 章节 ${baseline.docs.chapters} / 附录 ${baseline.docs.appendices}）`);
  console.log(`游戏      ${baseline.games}`);
  console.log(`文字块    ${baseline.proseBlocks}`);
  console.log(`表格      ${baseline.tables.total}（正文 ${baseline.tables.body} / A-D ${baseline.tables.ad} / E-F ${baseline.tables.ef}，最宽 ${baseline.tables.maxColumns} 列）`);
  console.log(`清单      ${baseline.checklists.items} 项 / ${baseline.checklists.groups} 组`);
  console.log(`伪标题    ${baseline.pseudoHeadings.total}（升级 ${baseline.pseudoHeadings.upgraded} / 保留段落 ${baseline.pseudoHeadings.keptAsParagraph}）`);
  console.log(`有序列表  D ${baseline.orderedLists.appendixD} / E ${baseline.orderedLists.appendixE}`);
  console.log('\n把以上数字与 spec 的验收点逐项对照；不一致时先确认以哪边为准。');
}

try {
  main();
} catch (error) {
  console.error(`✗ ${error.message}`);
  process.exit(error.code === 'ENOENT_SOURCE' ? 2 : 1);
}
