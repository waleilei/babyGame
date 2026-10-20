import test from 'node:test';
import assert from 'node:assert/strict';

import { pathsIn, staleTermsIn } from '../tools/check-docs.mjs';

test('文档路径提取：只保留仓库内、无通配符的反引号路径', () => {
  const text = [
    '`src/app.js`',
    '`data/*.json`',
    '`docs/architecture.md §15`',
    '`#/ch/5`',
    '`../books/0-3-game-book/manuscript/`',
    '`data/chapters/ch05.json`',
    '`docs/`',
  ].join(' ');
  assert.deepEqual(pathsIn(text), ['src/app.js', 'data/chapters/ch05.json', 'docs']);
});

test('文档旧符号识别', () => {
  assert.deepEqual(staleTermsIn('旧接口 getChapter 与 prefetchDoc 并存'), ['getChapter']);
  assert.deepEqual(staleTermsIn('当前接口 getDoc / prefetchDoc'), []);
});
