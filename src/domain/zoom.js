export const MIN_SCALE = 1;
export const MAX_SCALE = 6;

export function clampScale(scale) {
  if (!Number.isFinite(scale)) return MIN_SCALE;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/**
 * 以 stage 中心为原点的缩放。point 是光标相对中心的坐标。
 * @param {{ scale: number, x: number, y: number }} transform
 * @param {number} nextScale
 * @param {{ x: number, y: number }} point
 */
export function zoomAround({ scale, x, y }, nextScale, point) {
  const target = clampScale(nextScale);
  const ratio = target / scale;
  return {
    scale: target,
    x: point.x - (point.x - x) * ratio,
    y: point.y - (point.y - y) * ratio,
  };
}

/**
 * 限制平移范围，1 倍时强制回到中心，避免把图片拖出视野。
 * @param {{ scale: number, x: number, y: number }} transform
 * @param {{ width: number, height: number }} viewport
 */
export function clampOffset({ scale, x, y }, { width, height }) {
  const maxX = (width * (scale - 1)) / 2;
  const maxY = (height * (scale - 1)) / 2;
  return {
    scale,
    x: Math.min(maxX, Math.max(-maxX, x)),
    y: Math.min(maxY, Math.max(-maxY, y)),
  };
}
