import test from 'node:test';
import assert from 'node:assert/strict';

import { MAX_SCALE, MIN_SCALE, clampOffset, clampScale, isZoomed, zoomAround } from '../src/domain/zoom.js';

test('1 倍判定留 1% 容差，浮点误差不会把放大状态判回原始大小', () => {
  assert.equal(isZoomed(MIN_SCALE), false);
  assert.equal(isZoomed(1.005), false);
  assert.equal(isZoomed(1.02), true);
  assert.equal(isZoomed(MAX_SCALE), true);
});

test('缩放比例限制在 1-6 倍', () => {
  assert.equal(MIN_SCALE, 1);
  assert.equal(MAX_SCALE, 6);
  assert.equal(clampScale(0.5), 1);
  assert.equal(clampScale(1), 1);
  assert.equal(clampScale(2.5), 2.5);
  assert.equal(clampScale(7), 6);
  assert.equal(clampScale(Number.NaN), 1);
});

test('以指针位置为中心缩放，指针下的图像点保持不动', () => {
  const next = zoomAround({ scale: 1, x: 0, y: 0 }, 2, { x: 100, y: 50 });
  assert.deepEqual(next, { scale: 2, x: -100, y: -50 });
  assert.equal(100 * 2 + next.x, 100);
  assert.equal(50 * 2 + next.y, 50);
});

test('连续缩放累积比例与位移', () => {
  const first = zoomAround({ scale: 1, x: 0, y: 0 }, 2, { x: 100, y: 50 });
  const second = zoomAround(first, 4, { x: 100, y: 50 });
  assert.deepEqual(second, { scale: 4, x: -300, y: -150 });
});

test('超过上限的缩放请求按 6 倍计算', () => {
  const next = zoomAround({ scale: 1, x: 0, y: 0 }, 10, { x: 100, y: 50 });
  assert.deepEqual(next, { scale: 6, x: -500, y: -250 });
});

test('比例边界内平移限制在可视范围，1 倍时不能平移', () => {
  assert.deepEqual(clampOffset({ scale: 1, x: 200, y: 200 }, { width: 1000, height: 600 }), {
    scale: 1,
    x: 0,
    y: 0,
  });
  assert.deepEqual(clampOffset({ scale: 2, x: 800, y: -400 }, { width: 1000, height: 600 }), {
    scale: 2,
    x: 500,
    y: -300,
  });
  assert.deepEqual(clampOffset({ scale: 3, x: -1500, y: 900 }, { width: 1000, height: 600 }), {
    scale: 3,
    x: -1000,
    y: 600,
  });
});
