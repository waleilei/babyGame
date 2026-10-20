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
const dataDirs = ['chapters', 'docs'].map((name) => join(ROOT, 'data', name));

test('数据体积满足预算：目录与单文档', () => {
  const tocSize = statSync(join(ROOT, 'data/toc.json')).size;
  assert.ok(tocSize < BUDGET.toc, `toc.json ${kb(tocSize)} > ${kb(BUDGET.toc)}`);

  for (const dir of dataDirs) {
    assert.ok(existsSync(dir), `缺少 ${dir}`);
    for (const file of readdirSync(dir).filter((name) => name.endsWith('.json'))) {
      const size = statSync(join(dir, file)).size;
      assert.ok(size < BUDGET.doc, `${file} ${kb(size)} > ${kb(BUDGET.doc)}`);
    }
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
  for (const doc of toc.docs) {
    assert.ok(!doc.file.startsWith('/'), `${doc.id} 数据路径不是相对路径`);
    assert.match(doc.file, /^(chapters|docs)\/[a-z0-9-]+\.json$/, `${doc.id} 数据路径异常：${doc.file}`);
  }
});

test('文档数据中的插画路径相对页面文档解析', () => {
  for (const dir of dataDirs) {
    for (const file of readdirSync(dir).filter((name) => name.endsWith('.json'))) {
      const doc = JSON.parse(readFileSync(join(dir, file), 'utf8'));
      for (const game of doc.games ?? []) {
        for (const art of [game.art.main, ...game.art.panels]) {
          assert.ok(art.startsWith('assets/art/panel_web/'), `${game.id} 插画路径异常：${art}`);
          assert.ok(existsSync(join(ROOT, art)), `${game.id} 插画缺失：${art}`);
        }
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
  const required = [
    'index.html',
    'package.json',
    'styles/tokens.css',
    'styles/base.css',
    'styles/app.css',
    'data/toc.json',
    'data/docs/front.json',
    'data/chapters/ch05.json',
    'data/chapters/ch21.json',
  ];
  for (const file of required) {
    assert.ok(existsSync(join(ROOT, file)), `缺少 ${file}`);
  }
});
