# babyGame v0.1 发布说明

> 适用范围：第 5-18 章，130 个游戏，书稿 v1.4。
> 应用为纯静态 SPA，无打包、无运行时依赖；数据与插画在提交前生成。

## 1. 发布门禁

一条命令完成数据生成、独立校验与自动化测试：

```bash
npm run verify
# 等价于
npm run data && npm run check && npm test
```

- `npm run data`：从 `../books/0-3-game-book/manuscript/` 提取 130 条游戏，写出 `data/toc.json`、14 个章节 JSON，并把 `assets/art/panel_web/` 的 520 张水彩步骤图复制到本项目（每游戏 4 张，首张兼作卡片主图）。任一硬校验失败时不写出文件。
- `npm run check`：独立读取产物，复检 130 条、编号连续、8 模块、能力枚举、插画存在、目录索引与章节游戏逐条一致、体积预算。
- `npm test`：`node --test` 覆盖数据管线、仓储、领域纯函数与发布预算；共 37 条测试。

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

预取开关：默认在章节渲染后 1 秒预取相邻章；访问 `http://localhost:5173/?prefetch=off` 可关闭，行为退化为严格按需加载，功能不变。

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

所有路径均为相对路径，`data/toc.json` 中的章节文件名与插画路径也均为相对路径，因此可直接部署到站点根目录或任意子目录（例如 `https://example.com/babyGame/`）。

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
| `data/toc.json`、`data/chapters/*.json` | `Cache-Control: public, max-age=300` |
| `assets/art/panel_web/**` | `Cache-Control: public, max-age=31536000, immutable` |

水彩步骤图共 520 张（900×600 JPG，约 65 MB），每游戏 4 张，首张兼作卡片主图。首屏不请求插画；卡片图片使用 `loading="lazy"` 与固定 3:2 比例，章节页按需加载。
| `src/**/*.js`、`styles/*.css` | `Cache-Control: public, max-age=300` |

数据更新后最多 5 分钟生效；如需立即生效，可在发布时给 `data/*.json` 加版本查询参数，或刷新 CDN 缓存。插画文件名含游戏编号，内容变更时应使用新版本目录或刷新 CDN，不要复用旧缓存。

## 4. 验收清单

### 自动化

- [x] `data/toc.json` < 20 KB（实测约 13.8 KB）
- [x] 单章 JSON < 45 KB（实测最大约 18.3 KB）
- [x] 运行期 JS 未压缩 < 40 KB（实测 39,693 字节，约 38.8 KB）
- [x] 130 条游戏、14 章、2 篇、编号 01-130 连续唯一
- [x] 目录索引与章节游戏逐条一致
- [x] 所有导入、资源与插画路径均为相对路径
- [x] 运行期源码不使用 `innerHTML`

### 性能实测

在本机（headless Chrome 155，本地静态服务，360px 视口，禁用缓存）测得：

| 指标 | 预算 | 实测 |
|---|---|---|
| 首屏可交互（目录 14 行出现） | 本地 < 1 s | 34.5 ms |
| 首屏 FCP | — | 40 ms |
| 4G 首屏可交互 | < 2.5 s | 642.9 ms（40ms 延迟、1.5Mbps） |
| 缓存命中切章 | < 50 ms | 15 ms |
| CLS（目录 / 章节） | < 0.02 | 0 / 0 |

测量方式：`PerformanceNavigationTiming`、`first-contentful-paint`、`layout-shift` PerformanceObserver，以及切章点击到章标题更新的时间。数值随机器与网络波动，发布前建议在目标托管环境复测一次。

### 人工

- [x] 首屏 Network 只有目录数据，没有章节 JSON
- [x] 进入第 5 章后才请求 `data/chapters/ch05.json`
- [x] 章节渲染 1 秒后请求相邻章（第 5 章只请求第 6 章）
- [x] 关闭预取后不请求相邻章，章节仍可正常浏览
- [x] 360px 单列、768px 双列、1200px 三列，无横向滚动
- [x] 360px 章节工具栏三个按钮等宽，弹层全屏
- [x] 目录 → 章节 → 目录两次点击内完成
- [x] 第 12 章「下一章」进入第 13 章；第 5 章「上一章」禁用；第 18 章「下一章」禁用
- [x] 搜索「躲猫猫」命中并可直达游戏弹层
- [x] 搜索空态显示清除按钮，清除后输入框与目录同时恢复
- [x] 深链 `#/ch/10/game/76` 刷新后仍打开「儿歌接龙」
- [x] 卡片打开弹层后，后退先关闭弹层，再后退回到目录
- [x] 关闭弹层后焦点回到触发卡片；深链关闭后焦点到游戏网格标题
- [x] Esc 关闭弹层；桌面左右方向键切章
- [x] 断网进入新章节显示错误块与重试；恢复网络后重试成功
- [x] 目录加载失败显示整页错误块与重试
- [x] 插画 404 时显示同尺寸占位，卡片高度不塌陷
- [x] 子目录部署下目录、章节、插画、深链均正常

## 5. 回滚

部署产物与 Git 提交一一对应。回滚时重新部署上一个通过的提交中的 `index.html + styles/ + src/ + data/ + assets/` 即可；不要单独手改 `data/*.json` 或 `assets/art/panel_web/**`，它们是构建产物。

## 6. 数据更新流程

1. 修改 `../books/0-3-game-book/manuscript/ch05-08.md`、`ch09-12.md` 或 `ch13-18.md`。
2. 运行 `npm run data`。
3. 运行 `npm run check`，失败时按输出的游戏编号与缺失项修稿。
4. 运行 `npm test`，确认目录索引与章节数据对账通过。
5. 提交 `data/` 与 `assets/art/panel_web/` 的变更；页面代码无需改动。
