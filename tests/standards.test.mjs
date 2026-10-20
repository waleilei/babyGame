import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// 只放机械可判的规则：文本里能一票判定的，才写在这里。
// 需要判断「像不像周围代码」的，留给 code review 的 standards 轴。

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function offendersIn(files, pattern, describe) {
  const found = [];
  for (const file of files) {
    readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
      if (pattern.test(line)) found.push(`${relative(ROOT, file)}:${index + 1} ${describe(line.trim())}`);
    });
  }
  return found;
}

test('写死颜色只允许出现在 styles/tokens.css', () => {
  const stylesheets = readdirSync(join(ROOT, 'styles'))
    .filter((name) => name.endsWith('.css') && name !== 'tokens.css')
    .map((name) => join(ROOT, 'styles', name));

  const found = offendersIn(stylesheets, /#[0-9a-fA-F]{3,8}\b/, (line) => line);
  assert.deepEqual(found, [], `颜色改用 var(--token)，并在 tokens.css 里定义：\n${found.join('\n')}`);
});

test('运行期每个 <img> 都声明 decoding 策略', () => {
  const sources = walk(join(ROOT, 'src')).filter((file) => file.endsWith('.js'));
  const found = [];

  for (const file of sources) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/el\(\s*['"]img['"]\s*,\s*\{([^}]*)\}/g)) {
      if (/decoding\s*:/.test(match[1])) continue;
      const line = source.slice(0, match.index).split('\n').length;
      found.push(`${relative(ROOT, file)}:${line}`);
    }
  }

  assert.deepEqual(found, [], `<img> 需要 decoding: 'async'：\n${found.join('\n')}`);
});
