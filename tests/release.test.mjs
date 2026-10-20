import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BUDGET, kb } from '../tools/budgets.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

const runtimeFiles = walk(join(ROOT, 'src')).filter((file) => file.endsWith('.js'));

test('数据体积满足预算：目录与单章', () => {
  const tocSize = statSync(join(ROOT, 'data/toc.json')).size;
  assert.ok(tocSize < BUDGET.toc, `toc.json ${kb(tocSize)} > ${kb(BUDGET.toc)}`);

  for (const file of readdirSync(join(ROOT, 'data/chapters')).filter((name) => name.endsWith('.json'))) {
    const size = statSync(join(ROOT, 'data/chapters', file)).size;
    assert.ok(size < BUDGET.chapter, `${file} ${kb(size)} > ${kb(BUDGET.chapter)}`);
  }
});

test('运行期 JS 未压缩总量满足预算', () => {
  const total = runtimeFiles.reduce((sum, file) => sum + statSync(file).size, 0);
  assert.ok(total < BUDGET.runtimeJs, `运行期 JS ${kb(total)} > ${kb(BUDGET.runtimeJs)}`);
});

test('所有资源与模块使用相对路径，支持子目录部署', () => {
  const indexHtml = readFileSync(join(ROOT, 'index.html'), 'utf8');
  assert.ok(!/\b(?:src|href)="\/(?!\/)/.test(indexHtml), 'index.html 存在根绝对路径');

  const importPattern = /(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  for (const file of runtimeFiles) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(importPattern)) {
      assert.ok(match[1].startsWith('.'), `${file} 使用非相对导入 ${match[1]}`);
    }
    assert.ok(!/from\s+['"]\//.test(source), `${file} 存在根绝对导入`);
  }

  const toc = JSON.parse(readFileSync(join(ROOT, 'data/toc.json'), 'utf8'));
  for (const chapter of toc.chapters) {
    assert.ok(!chapter.file.startsWith('/'), `第${chapter.no}章数据路径不是相对路径`);
  }
});

test('章节数据中的插画路径相对页面文档解析', () => {
  for (const file of readdirSync(join(ROOT, 'data/chapters')).filter((name) => name.endsWith('.json'))) {
    const chapter = JSON.parse(readFileSync(join(ROOT, 'data/chapters', file), 'utf8'));
    for (const game of chapter.games) {
      for (const art of [game.art.main, ...game.art.panels]) {
        assert.ok(art.startsWith('assets/art/panel_web/'), `${game.id} 插画路径异常：${art}`);
        assert.ok(existsSync(join(ROOT, art)), `${game.id} 插画缺失：${art}`);
      }
    }
  }
});

test('运行期源码不把数据拼进 innerHTML', () => {
  for (const file of runtimeFiles) {
    const source = readFileSync(file, 'utf8');
    assert.ok(!/innerHTML/.test(source), `${file} 使用了 innerHTML`);
  }
});

test('发布所需文件齐全', () => {
  for (const file of ['index.html', 'package.json', 'styles/tokens.css', 'styles/base.css', 'styles/app.css', 'data/toc.json']) {
    assert.ok(existsSync(join(ROOT, file)), `缺少 ${file}`);
  }
});
