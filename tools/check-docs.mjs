import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DOC_FILES = [
  'docs/architecture.md',
  'docs/release.md',
  'docs/agents/issue-tracker.md',
  'docs/agents/domain.md',
  'docs/agents/review.md',
  'AGENTS.md',
  'GLOSSARY.md',
];
const ROOT_FILES = new Set(['index.html', 'package.json', 'jsconfig.json', 'AGENTS.md', 'GLOSSARY.md']);
const ROOT_PREFIXES = ['src/', 'styles/', 'tools/', 'tests/', 'data/', 'docs/', 'assets/', '.githooks/', '.github/'];
const SKIP_CHARS = ['…', '*', '<', '>', '{', '}', '、', ' ', '|', '#', '?', ':', '+', '=', ',', ';', '(', ')', '[', ']', '\'', '"', '§'];
/** 已从运行期移除的符号，文档不得继续引用。 */
const REMOVED_TERMS = [
  'getChapter',
  'prefetchChapter',
  'selectChapterView',
  'createChapterPage',
  'chapter-page.js',
  'src/data/checklist-store.js',
];

export function pathsIn(text) {
  const paths = [];
  for (const match of String(text).matchAll(/`([^`\n]+)`/g)) {
    const raw = match[1].trim();
    if (SKIP_CHARS.some((char) => raw.includes(char))) continue;
    if (!ROOT_FILES.has(raw) && !ROOT_PREFIXES.some((prefix) => raw.startsWith(prefix))) continue;
    paths.push(raw.replace(/\/$/, ''));
  }
  return paths;
}

export function staleTermsIn(text) {
  const value = String(text);
  return REMOVED_TERMS.filter((term) => value.includes(term));
}

function main() {
  const errors = [];
  let pathCount = 0;

  for (const file of DOC_FILES) {
    const text = readFileSync(join(ROOT, file), 'utf8');
    for (const path of pathsIn(text)) {
      pathCount += 1;
      if (!existsSync(join(ROOT, path))) errors.push(`${file}：路径不存在 ${path}`);
    }
    for (const term of staleTermsIn(text)) errors.push(`${file}：仍引用已移除的 ${term}`);
  }

  if (errors.length > 0) {
    for (const error of errors) console.error(`✗ ${error}`);
    console.error(`\n${errors.length} 个文档漂移，门禁未通过`);
    process.exit(1);
  }

  console.log(`✓ 文档  ${DOC_FILES.length} 个文件 / ${pathCount} 条路径 / ${REMOVED_TERMS.length} 个旧符号`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
