import test from 'node:test';
import assert from 'node:assert/strict';

import { LAYER_RULES, layerOf, specifiersOf, violationFor } from '../tools/check-imports.mjs';

const SRC = '/repo/src';
const file = (path) => `${SRC}/${path}`;

test('分层识别：app、页面、展示、领域与数据', () => {
  assert.equal(layerOf(file('app.js'), SRC), 'app');
  assert.equal(layerOf(file('pages/doc-page.js'), SRC), 'pages');
  assert.equal(layerOf(file('ui/blocks.js'), SRC), 'ui');
  assert.equal(layerOf(file('domain/format.js'), SRC), 'domain');
  assert.equal(layerOf(file('core/dom.js'), SRC), 'core');
  assert.equal(layerOf('/outside/x.js', SRC), null);
  assert.deepEqual(Object.keys(LAYER_RULES).sort(), ['app', 'core', 'data', 'domain', 'pages', 'state', 'ui']);
});

test('合法依赖：页面可用 core/domain/ui，展示可用 domain，组合根可用 data', () => {
  assert.equal(violationFor(file('pages/doc-page.js'), '../ui/blocks.js', SRC), null);
  assert.equal(violationFor(file('pages/doc-page.js'), '../domain/format.js', SRC), null);
  assert.equal(violationFor(file('ui/blocks.js'), '../domain/checklist.js', SRC), null);
  assert.equal(violationFor(file('ui/blocks.js'), '../core/dom.js', SRC), null);
  assert.equal(violationFor(file('app.js'), './data/repository.js', SRC), null);
  assert.equal(violationFor(file('pages/doc-page.js'), './games-body.js', SRC), null);
});

test('越界依赖：data→domain 与 pages→data 被拒绝', () => {
  assert.match(
    violationFor(file('data/checklist-store.js'), '../domain/checklist.js', SRC),
    /data 不允许依赖 domain/,
  );
  assert.match(
    violationFor(file('pages/doc-page.js'), '../data/checklist-store.js', SRC),
    /pages 不允许依赖 data/,
  );
  assert.match(
    violationFor(file('domain/format.js'), '../core/dom.js', SRC),
    /domain 不允许依赖 core/,
  );
  assert.match(
    violationFor(file('app.js'), './ui/toolbar.js', SRC),
    /app 不允许依赖 ui/,
  );
});

test('路径规则：禁止深层 ../、禁止越出 src、禁止非相对导入', () => {
  assert.match(
    violationFor(file('pages/doc-page.js'), '../../core/dom.js', SRC),
    /导入路径过深/,
  );
  assert.match(
    violationFor(file('ui/blocks.js'), '../styles/app.css', SRC),
    /无法识别分层/,
  );
  assert.match(
    violationFor(file('core/dom.js'), 'some-package', SRC),
    /非相对导入/,
  );
});

test('导入提取：静态 import/export 与动态 import', () => {
  const source = `
import { a } from './a.js';
import './side.js';
export { b } from '../domain/b.js';
const c = await import('./c.js');
  `;
  assert.deepEqual(specifiersOf(source), [
    './a.js',
    './side.js',
    '../domain/b.js',
    './c.js',
  ]);
});
