# 11: 大图功能代码清理

**What to build:** 按 2026-10-20 code review 的 Standards 轴清理大图相关代码，不改变已验收行为。

**Source:** 2026-10-20 code review（提交 09d6ce4）

**Blocked by:** 09

**Status:** done

- [x] 大图样式的 5 个写死颜色进入 `styles/tokens.css`，组件只引用令牌
- [x] `media-zoom` 改为符合 BEM 的 `media--zoom`，JS 与 CSS 同步
- [x] 大图 `<img>` 补 `decoding="async"`
- [x] 大图容器保持固定比例，不因加载抖动（已满足，未改动）
- [x] 图片 alt、放大按钮名称的拼接集中到 `domain/format.js`，去掉 `chapter-page` 与 `game-dialog` 的重复
- [x] 缩放上限、1 倍判定、步进倍率、双击倍率改用常量，复用 `MAX_SCALE`，不再散落魔数
- [x] 两个 dialog 的 `suppressClose` / `cancel` / `close` 流程合并为一处共享逻辑
- [x] 统一 `onZoom` 回调签名；组件必传，去掉无调用方的可选化；修正 `game-card` 的 JSDoc
- [x] 不改行为：`npm test` 全绿，07/09 的手动验收项逐条复测

## Comments

- **固定比例**：`.image-lightbox__stage` 是固定高度面板里的 `flex: 1` 子项，图片通过 `max-width/max-height: 100%` 与 `object-fit: contain` 在舞台内缩放，加载前后舞台尺寸不参与计算，不可能产生位移。因此本条只做核对，不改代码。
- **关闭流程合并**：新增 `src/core/dialog.js` 的 `bindDialogClose(dialog, onUserClose)`。抑制标志、`cancel` 的 `preventDefault`、`close` 事件的分流只保留一份；两个 dialog 各自只提供"用户关闭后要做什么"。
- **`onZoom` 签名**：统一为 `(game, index, trigger)`。`game-card` 原先的 `(game, trigger, index)` 是三者中唯一的异类；`game-dialog` 内部 `media()` 的 `onZoom(wrap)` 单参形态与可选化一并去掉，`media()` 现在只产出放大按钮。
- **常量**：`domain/zoom.js` 新增 `ZOOM_STEP` / `ZOOM_DOUBLE_CLICK` / `WHEEL_ZOOM_RATE` / `isZoomed()`。`1.01` 的 1% 容差收进 `isZoomed`，原先 5 处重复判定。
- **复测方式**：`npm test` 46 条全绿；07/09 的人工项用脚本驱动 Chrome 155 + CDP 逐条跑过（改名后旧类名零残留、CSS 规则仍命中、缩放步进与上限、左右切图、Esc 分层、× 与遮罩关闭并回路由）。
- **门禁边界**：`tests/standards.test.mjs` 的第一条只管十六进制颜色，rgba 遮罩不在其内——那些是覆盖层的 alpha 组合而非可复用调色板，令牌化只会造出 `--white-a06` 这类噪音。规则名已改成它真正强制的范围。
- **评审后修正**（两轴 review）：`game-card` 的 `aria-label` 原先仍手拼「查看《》主图大图」，是 `zoomButtonLabel` 之外的第二套词汇，已改为复用；`bindDialogClose` 原返回 `{ close }` 属多余包装，改为直接返回函数；`reset()` 的 `scale: 1` 改用 `MIN_SCALE`。

## Comments

2026-10-20 retro：两条机械项已下沉为门禁，不再靠 review 逐行看。

- 写死颜色由 `tests/standards.test.mjs` 强制：5 个颜色提为 `--stage-surface` / `--stage-ink` / `--stage-ink-soft` / `--stage-muted` / `--stage-hint`，另有 1 处 `outline-color: #fff` 改为 `--white`。
- `decoding="async"` 由同一文件的第二条规则强制。
- 仍未自动化：`media-zoom` 的 BEM 形态（类名语义需要判断，正则易误判）、魔数收敛、`suppressClose` 合并、`onZoom` 签名统一 —— 这几条留给 review 的 standards 轴。
