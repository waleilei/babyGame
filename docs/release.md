# babyGame v0.2 发布说明

> 适用范围：全书 28 个文档（前置 1 + 第 1-21 章 + 附录 A-F），130 个游戏，书稿 v1.4。
> 应用为纯静态 SPA，无打包、无运行时依赖；数据与插画在提交前生成。

## 1. 发布门禁

一条命令完成数据生成、独立校验与自动化测试：

```bash
npm run verify
# 等价于
npm run data && npm run check && npm test
```

- `npm run data`：从 `../books/0-3-game-book/manuscript/` 的 8 份稿件提取全书，写出 `data/toc.json`、`data/chapters/ch01…ch21.json` 与 `data/docs/front.json、apx-a…apx-f.json`，并把 520 张水彩步骤图复制到本项目。任一硬校验失败时不写出文件；不再被目录引用的旧 JSON 会被清理。
- `npm run check`：先按 `docs/architecture.md §15` 扫描分层依赖（越界依赖、深层 `../`、非相对导入），再检查文档里的仓库路径与已移除符号，最后独立读取产物，复检 28 个文档、130 条游戏、分组覆盖、块结构（表格列宽、清单项、有序列表 `start`、小节与标题一致）、插画存在、目录索引逐条一致、体积预算与孤儿文件。
- `npm test`：`node --test` 覆盖数据管线、仓储、领域纯函数、清单编码、路由、发布预算与编码规范。条数以命令输出为准，不在此处硬写。

提交与推送跑的是同一条只读门禁 `npm run check && npm test`：本地见 `.githooks/pre-commit`，远端见 `.github/workflows/verify.yml`；CI 另跑 `npm run smoke`（无 Chrome 时自动跳过）。`verify` 多出的 `npm run data` 会重写 `data/` 与 `assets/`，只在改稿或更新数据时用。新克隆启用本地钩子：

```bash
git config core.hooksPath .githooks
```

源稿件路径默认是仓库同级的 `../books/0-3-game-book`，可用 `BOOK_DIR` 覆盖：

```bash
BOOK_DIR=/path/to/0-3-game-book npm run data
```

## 2. 本地验收

```bash
npm run serve
# 打开 http://localhost:5173/
```

必须通过 HTTP 访问；`file://` 下浏览器会拦截 `fetch` 与 ES Modules。

预取开关：默认在文档渲染后 1 秒预取前后文档；访问 `http://localhost:5173/?prefetch=off` 可关闭，行为退化为严格按需加载，功能不变。

端到端冒烟（自带静态服务与 headless Chrome，不需要先开 `npm run serve`）：

```bash
npm run smoke
npm run smoke -- --perf          # 本地性能：FCP / 目录可交互 / 缓存命中切页 / CLS
npm run smoke -- --perf --slow   # 4G 模拟（40ms 延迟、1.5Mbps）
```

`smoke` 覆盖目录 28 行、搜索、清单刷新与重置、方向键翻页、深链弹层、Esc 分层、图片大图、360px 宽表、前置/附录边界、首屏请求、预取开关与 `/babyGame/` 子目录部署。未找到 Chrome 时会跳过；可用 `CHROME=/path/to/chrome` 指定。

## 3. 部署

### 3.1 发布内容

只上传运行期需要的五项，不要把 `docs/`、`tests/`、`tools/`、`.scratch/` 一起发布：

```
index.html
styles/
src/
data/
assets/
```

所有路径均为相对路径，`data/toc.json` 中的 `docs[].file` 与插画路径也均为相对路径，因此可直接部署到站点根目录或任意子目录（例如 `https://example.com/babyGame/`）。

### 3.2 GitHub Pages

1. 将上述五项放在发布目录（仓库根或 Pages 指定的目录）。
2. Pages 的发布目录不要指向包含 `docs/release.md` 的 `docs/`，除非把运行期五项复制进去。
3. 不需要 Actions 构建，也不需要 404 重写；hash 路由不会产生服务器路径请求。

### 3.3 其他静态托管

对象存储 / Nginx / CloudBase：上传五项，默认首页设为 `index.html`。无需配置 SPA fallback。

### 3.4 缓存策略

| 资源 | 建议响应头 |
|---|---|
| `index.html` | `Cache-Control: no-cache` |
| `data/toc.json`、`data/chapters/*.json`、`data/docs/*.json` | `Cache-Control: public, max-age=300` |
| `assets/art/panel_web/**` | `Cache-Control: public, max-age=31536000, immutable` |
| `src/**/*.js`、`styles/*.css` | `Cache-Control: public, max-age=300` |

水彩步骤图共 520 张（900×600 JPG，约 65 MB），每游戏 4 张，首张兼作卡片主图。首屏不请求插画；卡片图片使用 `loading="lazy"` 与固定 3:2 比例，章节页按需加载。

数据更新后最多 5 分钟生效；如需立即生效，可在发布时给 `data/*.json` 加版本查询参数，或刷新 CDN 缓存。插画文件名含游戏编号，内容变更时应使用新版本目录或刷新 CDN，不要复用旧缓存。

## 4. 验收清单

### 自动化

- [x] 体积预算（目录 / 单文档 / 运行期 JS）由 `npm test` 自动校验，阈值定义在 `tools/budgets.mjs`；实测 toc 18.9 KB、单文档最大 18.4 KB、运行期 JS 约 71.5 KB（预算 72 KB）
- [x] 28 个文档（前置 1 + 第 1-21 章 + 附录 A-F）、130 条游戏；编号 01-130 连续唯一
- [x] 分组恰好覆盖 28 个文档一次，顺序与 `docs` 一致
- [x] 附录 B 37 项清单解析为 6 个 `checklist` 块
- [x] 附录 A-D 共 13 张表，E/F 追加 4 张，合计 17 张；最宽 5 列，每行列数与表头一致
- [x] 附录 D 的 1-50、附录 E 的 1-30 跨块编号连续
- [x] 伪标题升级为 `h4`，带句末标点的整段加粗保留为段落
- [x] 目录索引以 `docId` 关联文档，并保留章号
- [x] 分层依赖由 `tools/check-imports.mjs` 强制，越界依赖会让 `npm run check` 失败
- [x] 所有导入、资源与插画路径均为相对路径
- [x] 运行期源码不使用 `innerHTML`
- [x] 写死颜色只出现在 `styles/tokens.css`；每个 `<img>` 声明 `decoding`
- [x] `data/chapters` 与 `data/docs` 无孤儿文件
- [x] 首屏只请求 `toc.json`，不请求 `chapters/` 或 `docs/` JSON
- [x] 进入第 5 章后请求 `ch05.json`；1 秒后预取 `ch04/ch06`
- [x] `?prefetch=off` 时不再请求相邻文档
- [x] 子目录部署（`/babyGame/`）下目录、深链与插画正常

### 性能实测

在本机（headless Chrome 155，本地静态服务，360px 视口，禁用缓存）用 `npm run smoke -- --perf` 测得：

| 指标 | 预算 | 实测 |
|---|---|---|
| 首屏可交互（目录 28 行出现） | 本地 < 1 s | 43.1 ms |
| 首屏 FCP | — | 40.0 ms |
| 4G 首屏可交互（`--perf --slow`） | < 2.5 s | 957.0 ms（40 ms 延迟、1.5 Mbps，缓存禁用） |
| 缓存命中切页（第 5 → 6 章） | < 50 ms | 4.6 ms |
| CLS（目录 / 文档） | < 0.02 | 0.010 / 0.000 |

测量方式：`PerformanceNavigationTiming`、`first-contentful-paint`、`layout-shift` PerformanceObserver，以及切页点击到文档标题更新的时间。CLS 从正文内容出现开始累计（骨架替换骨架本身不计）；目录骨架不再重复 hero、加载期预留搜索框后，替换位移为 0.010。数值随机器与网络波动，发布前建议在目标托管环境复测一次。

### 人工

首屏请求、预取开关与子目录部署已上移到自动化；以下条目仍需人眼复核。

- [x] 360px / 768px / 1440px 三档无横向滚动；宽表在容器内横向滚动，首列保持可见
- [x] 目录 28 行、6 个分组；前置 / 第一篇 / 第二篇 / 第三篇 / 第四篇 / 附录
- [x] 目录 → 文档 → 目录两次点击内完成
- [x] 第 4 章「下一页」进入第 5 章；第 12 章进入第 13 章；第 18 章进入第 19 章；第 21 章进入附录 A
- [x] 前置「上一页」禁用；附录 F「下一页」禁用
- [x] 搜索「躲猫猫」命中并直达游戏弹层；搜索「里程碑」命中附录 A
- [x] 搜索空态显示清除按钮，清除后输入框与目录同时恢复
- [x] 深链 `#/ch/10/game/76` 刷新后仍打开「儿歌接龙」
- [x] 卡片打开弹层后，后退先关闭弹层，再后退回到上一文档
- [x] 关闭弹层后焦点回到触发卡片；深链关闭后焦点到游戏网格标题
- [x] Esc 关闭弹层；桌面左右方向键切页
- [x] 断网进入未缓存文档显示错误块与重试；恢复网络后重试成功
- [x] 目录加载失败显示整页错误块与重试
- [x] 插画 404 时显示同尺寸占位，卡片高度不塌陷
- [x] 文字章标题、表格、清单、引用与稿件一致；附录 B 37 项可勾选
- [x] 勾选后刷新仍保留；「重置本页勾选」清空并取消全部勾选
- [x] 小节导航点击滚动到对应标题，URL 不变；移动端点击后自动收起
- [x] 表格容器可 Tab 聚焦；清单可用键盘空格勾选
- [x] 点击卡片主图、弹层主图或步骤图打开大图；滚轮/双指缩放、拖拽平移、左右切换、Esc 关闭
- [x] 大图关闭后焦点回到被点击图片；从弹层打开时只关闭大图，游戏详情保留

## 5. 回滚

部署产物与 Git 提交一一对应。回滚时重新部署上一个通过的提交中的 `index.html + styles/ + src/ + data/ + assets/` 即可；不要单独手改 `data/*.json` 或 `assets/art/panel_web/**`，它们是构建产物。

## 6. 数据更新流程

1. 先运行 `npm run baseline`，把输出与 spec 的验收数字对照；不一致时先确认以哪边为准。
2. 修改 `../books/0-3-game-book/manuscript/` 下对应稿件（游戏章 `ch05-08.md`、`ch09-12.md`、`ch13-18.md`；文字章 `front-matter.md`、`part1-ch01-02.md`、`part1-ch03-04.md`、`part4-ch19-21.md`、`appendix.md`）。
3. 运行 `npm run data`。
4. 运行 `npm run check`，失败时按输出的文档 id、行号与块号修稿。
5. 运行 `npm test`，确认目录索引、块结构与产物对账通过。
6. 提交 `data/` 与 `assets/art/panel_web/` 的变更；页面代码无需改动。

## 7. 图片大图

- 卡片主图、弹层主图、4 张步骤图均可点击查看大图。
- 使用第二个原生 `<dialog>` 叠层，不新增路由、不写 URL。
- 支持滚轮/双指缩放（1-6 倍）、拖拽平移、双击缩放、`+ / - / 0` 与左右方向键切换。
- Esc 只关闭最上层大图；关闭后焦点回到被点击的图片按钮。
- 卡片拆为“图片放大按钮 + 详情按钮”，避免 `<button>` 嵌套，并保留键盘 Enter/Space 操作。

## 8. 清单状态

- 存储键：`babyGame:checklist:{docId}`；值只包含已勾选项，形如 `["12:0","12:2"]`。
- 读取时忽略越界或未知键；块结构变化不会让页面报错。
- 隐私模式、配额不足或禁用 localStorage 时静默降级：本次会话内勾选有效，刷新后丢失。
- 「重置本页勾选」清空该文档的存储键并取消页面上全部勾选。
