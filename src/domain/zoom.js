export const MIN_SCALE = 1;
export const MAX_SCALE = 6;

/** 按钮与键盘 +/- 的单次步进倍率 */
export const ZOOM_STEP = 1.3;
/** 双击放大到的倍率 */
export const ZOOM_DOUBLE_CLICK = 2.5;
/** 滚轮灵敏度：deltaY 每像素对应的指数衰减系数 */
export const WHEEL_ZOOM_RATE = 0.0015;

/**
 * 是否已被放大。留 1% 容差，避免浮点误差把刚缩放的图片判回原始大小。
 * @param {number} scale
 */
export function isZoomed(scale) {
  return scale > MIN_SCALE + 0.01;
}

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
