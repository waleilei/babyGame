import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');

/**
 * 分层依赖矩阵，唯一来源是 docs/architecture.md §15。
 * 行 = 发起方，集合 = 允许依赖的层。
 */
export const LAYER_RULES = {
  core: new Set(['core']),
  domain: new Set(['domain']),
  data: new Set(['core', 'data']),
  state: new Set(['core', 'domain', 'state']),
  ui: new Set(['core', 'domain', 'ui']),
  pages: new Set(['core', 'domain', 'ui', 'pages']),
  app: new Set(['core', 'domain', 'data', 'state', 'pages']),
};

const IMPORT_PATTERNS = [
  /(?:^|\n)\s*(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

export function specifiersOf(source) {
  const found = [];
  for (const pattern of IMPORT_PATTERNS) {
    for (const match of String(source).matchAll(pattern)) found.push(match[1]);
  }
  return found;
}

export function layerOf(file, srcRoot = SRC) {
  const path = relative(srcRoot, file).split(sep).join('/');
  if (path.startsWith('../')) return null;
  const [first] = path.split('/');
  if (first === 'app.js') return 'app';
  return Object.hasOwn(LAYER_RULES, first) ? first : null;
}

/**
 * 返回违规说明；合法导入返回 null。
 * @param {string} fromFile 绝对路径
 * @param {string} specifier import/export 后的字符串
 * @param {string} srcRoot src 根目录
 */
export function violationFor(fromFile, specifier, srcRoot = SRC) {
  const from = relative(dirname(srcRoot), fromFile) || fromFile;

  if (!specifier.startsWith('.')) {
    return `${from}：非相对导入 ${specifier}`;
  }
  if (specifier.split('/').filter((part) => part === '..').length > 1) {
    return `${from}：导入路径过深 ${specifier}（最多一层 ../）`;
  }

  const target = resolve(dirname(fromFile), specifier);
  if (target !== srcRoot && !target.startsWith(srcRoot + sep)) {
    return `${from}：导入越出 src/（${specifier}）`;
  }

  const fromLayer = layerOf(fromFile, srcRoot);
  const targetLayer = layerOf(target, srcRoot);
  if (!fromLayer || !targetLayer) {
    return `${from}：无法识别分层（${specifier}）`;
  }
  if (!LAYER_RULES[fromLayer].has(targetLayer)) {
    return `${from} → src/${targetLayer}：${fromLayer} 不允许依赖 ${targetLayer}`;
  }
  return null;
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function main() {
  const files = walk(SRC).filter((file) => file.endsWith('.js'));
  const errors = [];
  let imports = 0;

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const specifier of specifiersOf(source)) {
      imports += 1;
      const violation = violationFor(file, specifier);
      if (violation) errors.push(violation);
    }
  }

  if (errors.length > 0) {
    for (const error of errors) console.error(`✗ ${error}`);
    console.error(`\n${errors.length} 个导入违规，分层门禁未通过`);
    process.exit(1);
  }

  console.log(`✓ 导入  ${files.length} 个模块 / ${imports} 条导入 / ${Object.keys(LAYER_RULES).length} 个分层`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
