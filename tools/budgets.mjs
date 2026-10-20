// 体积预算与容量阈值的唯一来源。
// check-games.mjs 与 tests/release.test.mjs 都从这里取值；文档只写指针，不重抄数字。

/** @type {{ toc: number, doc: number, runtimeJs: number }} 单位：字节 */
export const BUDGET = {
  /** 目录数据上限 */
  toc: 20 * 1024,
  /** 单个文档数据上限（游戏章、文字章、前置、附录统一口径） */
  doc: 45 * 1024,
  /** 运行期 JS 未压缩总量上限（v0.2 增加文字章、块渲染、小节导航与清单状态） */
  runtimeJs: 72 * 1024,
};

/** 单章游戏数超过此值就需要重新评估分页或虚拟滚动 */
export const MAX_GAMES_PER_CHAPTER = 14;

/** @param {number} bytes */
export const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
