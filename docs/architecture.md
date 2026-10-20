# babyGame v0.1 前端架构方案

> 状态：已确认（两轮设计评审通过） ｜ 版本：0.2 ｜ 日期：2026-10-20
> 依据需求：PC/移动自适应；一次只加载一个章节；目录、章节、相邻章之间快速跳转
> 前序文档：`docs/design.md`（v0.1，已被本文取代）

---

## 0. 摘要

| 项 | 结论 |
|---|---|
| 应用形态 | 纯静态单页应用（SPA），无框架、无打包器、原生 ES Modules |
| 内容范围 | v0.1 只收录 14 个游戏章（第 5-18 章，130 个游戏） |
| 路由 | hash 路由：`#/`、`#/ch/5`、`#/ch/5/game/01` |
| 数据 | 构建期把 Markdown 提取为 `toc.json` + 14 个章节 JSON |
| 加载 | 首屏只加载 `toc.json`；进入章节只加载该章 JSON；空闲时预取相邻章 |
| 状态 | 单一 store + 纯函数 selector + 单向数据流；URL 是导航状态的唯一来源 |
| 详情 | 章节页内的原生 `<dialog>`，深链可直达 |
| 部署 | 任意静态托管，相对路径 + hash，无需服务器重写 |
| 后端 | v0.1 无后端；静态 JSON 通过 `CatalogRepository` 接口提供，未来可替换为 REST |

---

## 1. 需求与已确认决策

### 1.1 功能性需求

| 编号 | 需求 | 验收口径 |
|---|---|---|
| R1 | PC 与手机自适应 | 360px 无横向滚动；≥1024px 三列卡片；弹层手机全屏 |
| R2 | 一次只加载一个章节 | 首屏只请求 `toc.json`；章节页只请求该章 JSON；渲染树中只有一章内容 |
| R3 | 目录 ↔ 章节 | 目录点击进章；章节内“目录”按钮一次点击返回；深链可直达 |
| R4 | 相邻章节 | 上一章/下一章按钮显示目标章名；12→13 跨篇连续；首尾禁用 |
| R5 | 目录搜索 | 按游戏名搜索 130 条索引，结果显示章号、月龄、能力，点击直达 |
| R6 | 游戏详情 | 8 个模块完整；4 张步骤图；关闭后回到原卡片位置 |

### 1.2 已确认的设计决策

| 编号 | 决策 | 说明 |
|---|---|---|
| D1 | 只做 14 个游戏章 | 数据结构预留 `kind: "games" \| "prose"`，v0.2 接 7 个文字章与 6 个附录 |
| D2 | SPA + hash 路由 | 不需要 SEO；静态托管零配置；切换无整页刷新 |
| D3 | 目录独立成页 | `#/` 为目录；章节页顶部固定“目录 / 上一章 / 下一章” |
| D4 | 搜索只搜游戏名 | 索引内嵌 `toc.json`；章节页不做搜索 |
| D5 | 详情用 `<dialog>` | 保留章节滚动位置；深链 `#/ch/5/game/01` |
| D6 | 相邻章线性、跨篇、不循环 | 5→…→18；第 5 章无上一章，第 18 章无下一章 |
| D7 | 空闲预取相邻章 | 章节渲染后 1s 预取前后章，只暖缓存、不渲染 |
| D8 | 切章回顶部并对焦标题 | 弹层关闭恢复卡片焦点；目录回顶部 |
| D9 | 章节页显示章首导语 | 构建期把“发展地图/场景说明”解析为 `intro` 块 |
| D10 | 目录不显示配图 | 每章显示章号、标题、月龄、游戏数；首屏保持轻量 |
| D11 | 本地 + GitHub Pages 可用 | 全相对路径 + hash；未来接 CloudBase 不改代码 |
| D12 | 三档断点、桌面方向键 | `<640` / `640-1023` / `≥1024`；`←/→` 切章、`Esc` 关弹层；不做滑动手势 |

---

## 2. 整体架构模式与分层

### 2.1 模式

**静态 SPA + 四层模块化**。不引入框架，但用目录与 import 方向强制分层，避免退化成“一个 app.js 打天下”。

```
┌────────────────────── 构建期（Node，离线执行） ──────────────────────┐
│  manuscript/*.md                                                     │
│        │ tools/extract-games.mjs                                     │
│        ▼                                                             │
│  data/toc.json  +  data/chapters/ch05.json … ch18.json               │
│  assets/art/panel_web/**                                             │
│        │ tools/check-games.mjs（独立复检）                             │
└────────┼─────────────────────────────────────────────────────────────┘
         │ 静态文件（HTTP）
┌────────▼──────────────── 运行期（浏览器） ───────────────────────────┐
│                                                                      │
│  app.js（组合根 / 路由 / 编排）                                       │
│    ├─ pages/toc-page.js        ──┐                                   │
│    ├─ pages/chapter-page.js      │ 展示层                             │
│    │     └─ ui/*                 │                                   │
│    ├─ domain/*（纯函数）         │ 领域层                             │
│    ├─ data/repository.js         │ 数据层                             │
│    └─ state/store.js             │ 应用状态                           │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### 2.2 分层职责与依赖规则

| 层 | 目录 | 职责 | 允许依赖 | 禁止 |
|---|---|---|---|---|
| 组合根 | `src/app.js` | 启动、订阅路由、调度加载、组装页面 | 全部 | 写具体 UI 细节 |
| 页面层 | `src/pages/` | 页面级布局、组合组件、绑定页面事件 | core、domain、ui | 直接 fetch、直接改 store 内部 |
| 展示层 | `src/ui/` | 无状态组件与可复用视觉单元 | core、domain/format | 读取全局状态、发请求 |
| 领域层 | `src/domain/` | 路由解析、搜索、相邻章、视图模型 | 无（纯函数） | 触碰 DOM、fetch、window |
| 数据层 | `src/data/` | 加载、缓存、DTO → 领域对象、错误归一 | core/http | 触碰 DOM、读取页面状态 |
| 基础设施 | `src/core/` | DOM 构造、store、router、focus、idle | 无（router 接触 location） | 含业务规则 |
| 构建期 | `tools/` | 解析稿件、校验、写 JSON、复制插画 | Node 内置模块 | 被浏览器代码 import |

依赖方向只能自上而下。`domain` 不 import 任何运行时代码，因此可以用 `node --test` 直接测试。

### 2.3 为什么不用框架

| 维度 | 本项目 |
|---|---|
| 页面数 | 2 个（目录、章节） |
| 状态数 | 1 个 store，5 类动作 |
| 数据量 | 14 章、130 条，单章最大约 18 KB |
| 交互 | 路由切换、搜索过滤、弹层开关、预取 |

React/Vue 的主要收益（组件复用、响应式更新、生态）在这个规模下不足以抵消构建链、依赖与心智负担。原生 DOM 的代价是“显式更新”，但本项目只有两处需要增量更新（搜索结果、弹层），用页面对象的 `update()` 方法即可控制。

**重估触发条件**：模块数 > 50、需要 SSR/SEO、需要账号与多端同步、或团队多人并行开发。

---

## 3. 目录结构

```
babyGame/
├── index.html                    # 应用壳：skip link + #view + #toast
├── package.json                  # 仅 scripts，无 dependencies
├── jsconfig.json                 # checkJs + JSDoc 类型提示（可选）
├── styles/
│   ├── tokens.css                # 颜色、字号、间距、圆角
│   ├── base.css                  # reset、排版、通用元素
│   └── app.css                   # 布局、页面、组件
├── src/
│   ├── app.js                    # 组合根
│   ├── core/
│   │   ├── dom.js                # el() / clear()
│   │   ├── dialog.js             # bindDialogClose() 两个弹层共享的关闭纪律
│   │   ├── toast.js              # 全局提示
│   │   ├── store.js              # createStore()
│   │   ├── router.js             # parseHash / buildHash / createRouter
│   │   └── idle.js               # requestIdle 兼容封装
│   ├── domain/
│   │   ├── route.js              # resolveRoute 路由校验
│   │   ├── catalog.js            # 搜索、相邻章、分组
│   │   ├── zoom.js               # 缩放比例、锚点缩放、平移边界
│   │   └── format.js             # 计数、月龄、标题拼接
│   ├── data/
│   │   ├── http.js               # getJSON + 错误归一
│   │   └── repository.js         # CatalogRepository + 缓存 + 预取暖缓存
│   ├── state/
│   │   ├── store.js              # 初始 state
│   │   └── selectors.js          # 纯函数视图模型
│   ├── ui/
│   │   ├── toolbar.js            # 目录 / 上一章 / 下一章
│   │   ├── toc-list.js           # 按篇分组的章节列表
│   │   ├── search-box.js
│   │   ├── search-results.js
│   │   ├── game-card.js          # 图片放大 + 详情双按钮
│   │   ├── game-grid.js
│   │   ├── game-dialog.js
│   │   ├── image-lightbox.js     # 大图缩放/平移/切换
│   │   ├── intro.js              # 章首导语块渲染
│   │   └── states.js             # skeleton / empty / error
│   └── pages/
│       ├── toc-page.js
│       └── chapter-page.js
├── data/
│   ├── toc.json                  # 目录 + 130 条游戏名索引
│   └── chapters/ch05.json … ch18.json
├── assets/art/panel_web/**       # 520 张水彩步骤图（每游戏 4 张，首张兼作主图）
├── tools/
│   ├── budgets.mjs               # 体积预算与容量阈值的唯一来源
│   ├── extract-games.mjs
│   └── check-games.mjs
├── tests/
│   ├── data-pipeline.test.mjs
│   ├── domain.test.mjs
│   ├── repository.test.mjs
│   ├── release.test.mjs          # 体积预算、相对路径、innerHTML
│   ├── standards.test.mjs        # 十六进制颜色、img decoding
│   └── zoom.test.mjs
├── .githooks/pre-commit          # 只读门禁
├── .github/workflows/verify.yml  # 同一条门禁
└── docs/
    ├── architecture.md           # 本文
    └── design.md                 # v0.1，已归档
```

估算代码量：运行期约 1,500-1,700 行（不含 CSS），构建期约 250 行。

---

## 4. 核心模块与接口

### 4.1 接口一览

```js
// core/dom.js
export function el(tag, props = {}, children = []) : HTMLElement
export function frag(children = []) : DocumentFragment
export function clear(node) : void

// core/store.js
export function createStore(initialState) : {
  getState(): State,
  setState(patch: Partial<State> | ((s: State) => Partial<State>)): void,
  subscribe(fn: (s: State) => void): () => void
}

// core/router.js
export function parseHash(hash: string) : Route | null
export function buildHash(route: Route) : string
export function createRouter({ onRoute }) : {
  start(): void,
  navigate(route: Route, opts?: { replace?: boolean }): void
}

// core/dialog.js：两个弹层共享的关闭纪律
export function bindDialogClose(dialog: HTMLDialogElement, onUserClose: () => void) : () => void
// 返回的是程序化关闭函数，不回触发 onUserClose；用户关闭（Esc、遮罩）走 onUserClose

// data/repository.js
export function createCatalogRepository({ baseUrl, fetchImpl } = {}) : CatalogRepository

// CatalogRepository
{
  getToc(opts?: { signal }): Promise<Toc>,
  getChapter(no: number, opts?: { signal }): Promise<Chapter>,
  prefetchChapter(no: number): void
}

// state/selectors.js
export function selectTocView(state): TocView
export function selectChapterView(state, no): ChapterView
export function selectNeighbors(toc, no): { prev, next }
export function selectSearchResults(toc, query): SearchHit[]
export function selectGame(state, route): Game | null

// pages/*.js
export function createTocPage(props): { el, update(state), destroy() }
export function createChapterPage(props): { el, update(state), destroy() }
```

所有 JSDoc 类型集中在 `src/types.js`（仅注释，不产出代码），配合 `jsconfig.json` 获得编辑器校验，不引入 TypeScript 构建。

### 4.2 模块职责

| 模块 | 关键职责 | 明确不做 |
|---|---|---|
| `app.js` | 初始化 store/router；处理路由；调度 toc/chapter 加载；挂载页面；设置标题；预取 | 不实现卡片、弹层细节 |
| `pages/toc-page.js` | 目录布局、搜索框、结果区、章节列表；维护输入焦点 | 不发请求、不改 URL |
| `pages/chapter-page.js` | 章首、工具栏、卡片网格、弹层；上一/下一章 | 不计算相邻章（用 selector） |
| `ui/game-card.js` | 单卡结构与点击回调 | 不判断筛选 |
| `ui/game-dialog.js` | `<dialog>` 生命周期、8 模块排版、焦点管理 | 不加载数据 |
| `domain/catalog.js` | 搜索匹配、相邻章、分组、计数 | 不读写 DOM |
| `data/repository.js` | 请求、缓存、并发去重、DTO 校验、错误归一 | 不感知路由 |
| `state/store.js` | 初始状态与状态动作 | 不渲染 |
| `state/selectors.js` | 由 state 派生视图模型 | 无副作用 |

---

## 5. 状态管理与数据流

### 5.1 State 形状

```js
{
  route: { name: 'toc' }
       | { name: 'chapter', chapterNo: 5, gameId: null | '01' },

  toc: { status: 'idle'|'loading'|'ready'|'error', data: Toc|null, error: null|AppError },

  chapters: {
    5: { status: 'idle'|'loading'|'ready'|'error', data: Chapter|null, error: AppError|null }
  },

  query: ''   // 目录搜索词，仅 UI 状态，不写入 URL
}
```

设计要点：

- **路由状态只存一份**：`route` 是导航的唯一来源，弹层开关由 `route.gameId` 派生，不另设 `isDialogOpen`。
- **章节数据按章缓存**：`chapters` 是普通对象，不用 `Map`，便于浅合并与调试。
- **搜索词不进 URL**：v0.1 刷新后清空，避免与路由参数耦合。
- **不做全局 loading**：每个资源独立 `status`，目录与章节可分别显示骨架屏。

### 5.2 单向数据流

```
用户事件 ──► 页面/组件回调 ──► app 动作 ──► store.setState
                                              │
                                              ▼
                                        订阅者 render
                                              │
                          ┌───────────────────┴───────────────────┐
                          ▼                                       ▼
                  selectors 派生视图模型                   更新 document.title
                          │
                          ▼
                   pages/ui 写入 DOM
```

规则：

1. 只有 `app.js` 调用 `store.setState`；页面与组件只发回调。
2. `selectors` 是纯函数，输入 state，输出视图模型，可单测。
3. 数据加载只发生在 `repository`；`app` 负责把结果写入 store。
4. DOM 写入只发生在 `ui`/`pages`；同一份数据不重复渲染。

### 5.3 动作

| 动作 | 触发 | 副作用 |
|---|---|---|
| `routeChanged(route)` | hashchange / navigate | 设置 route；按需加载 toc/chapter；渲染 |
| `tocLoaded(data)` / `tocFailed(err)` | repository 返回 | 更新 `toc.status` |
| `chapterRequested(no)` | 路由需要章节 | `chapters[no].status = loading` |
| `chapterLoaded(no, data)` / `chapterFailed(no, err)` | repository 返回 | 更新该章状态；触发预取 |
| `searchChanged(query)` | 搜索输入 | 更新 `query`，仅刷新结果区 |

---

## 6. 路由与页面组织

### 6.1 路由表

| hash | 页面 | 加载内容 |
|---|---|---|
| `#/` 或空 | 目录 | `toc.json` |
| `#/ch/5` | 章节 | `toc.json`（若未加载）+ `chapters/ch05.json` |
| `#/ch/5/game/01` | 章节 + 弹层 | 同上，加载完成后打开弹层 |

规则：

- 章节号解析为整数，URL 用不补零的 `5`；文件名补零 `ch05.json`，由 `toc.chapters[].file` 给出。
- 游戏 id 保留两位字符串（`01`），与数据契约一致。
- 非法 hash（空段、非数字、章节不存在）：`history.replaceState` 回 `#/`，并显示一条 toast「章节不存在」。
- 打开弹层用 `push`（可后退关闭）；关闭弹层用 `replace`（不产生额外历史项）。
- 关闭弹层后焦点回到触发卡片；深链进入时焦点落到网格标题。

### 6.2 页面结构

```
index.html
├── a.skip-link                  # 跳到 #view
├── main#view                    # 页面容器，整页替换
└── div#toast[aria-live=polite]
```

**目录页**

```
<header class="toc-hero">        标题 + 副标题 + 总游戏数
<section class="search">         搜索框 + 结果区
<nav class="toc">                按篇分组
  <section class="toc__part">    篇名
    <a class="toc__row">         第5章 / 标题 / 月龄 / 10个游戏
```

**章节页**

```
<header class="chapter-bar">     目录 ｜ 上一章 ｜ 下一章（sticky）
<main class="chapter">
  <h1>第5章 0-3个月｜躺着的世界</h1>
  <p class="chapter__meta">0-3月 · 10个游戏</p>
  <section class="intro">        发展地图 / 场景说明
  <ul class="grid">              游戏卡片
<footer class="chapter-nav">     上一章 / 下一页
<dialog class="game-dialog">     详情
```

### 6.3 页面生命周期

| 时机 | 行为 |
|---|---|
| 进入目录 | 若无 toc 则加载；渲染；滚动到顶部；标题 `babyGame · 130个亲子游戏` |
| 进入章节 | 确保 toc；加载章节；渲染骨架；成功后 `scrollTo(0,0)` 并把焦点放到 `h1` |
| 章内打开弹层 | 不重新加载章节；`showModal()`；焦点进入关闭按钮 |
| 关闭弹层 | `close()`；`replace` 回 `#/ch/5`；焦点回卡片 |
| 上一/下一章 | `push` 新 hash；命中缓存则立即渲染，否则骨架 |
| 浏览器后退 | 交给 hashchange；弹层状态由 route 派生，不额外处理 |

页面对象暴露 `destroy()`，在替换页面前调用，移除 `window`/`document` 级监听（元素级监听随节点移除自动释放）。

---

## 7. 组件设计规范与复用

### 7.1 组件契约

```js
createX({ ...props, onAction }) => HTMLElement
```

- 一个组件一个文件，一个默认导出；文件名用 kebab-case，导出名用 `createXxx`。
- 组件是**纯展示函数**：相同 props 产出相同 DOM；不读 store、不发请求、不写 `location`。
- 交互通过回调向上传递；组件不修改传入对象。
- 需要局部状态时（如弹层开合），由页面对象持有，组件只暴露 `open(game)` / `close()`。
- 所有文本用 `textContent`/`el()` 写入，**禁止把数据拼进 `innerHTML`**；唯一例外是 `intro` 的粗体解析，先按 `**` 切段再逐段建节点。
- 列表与卡片里的图片统一 `loading="lazy" decoding="async"`，容器用 `aspect-ratio` 预留高度，避免 CLS。唯一例外是大图查看器：它展示的正是用户此刻要看的图，故不 lazy；舞台是缩放平移视口而非图片盒，尺寸由固定高度的面板决定，故不设 `aspect-ratio`。
- 卡片内的图片与详情各用一个 `<button type="button">`，不嵌套；不拿 `div` 当按钮。

### 7.2 DOM 构造原语

```js
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== false) node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(children)) if (c != null) node.append(c);
  return node;
}
```

该原语被所有组件复用，也是“安全默认值”的落点：文本永远走 `textContent`。

### 7.3 复用矩阵

| 组件 | 目录页 | 章节页 | 说明 |
|---|---|---|---|
| `toolbar` | — | ✓ | 固定三段：目录 / 上一章 / 下一章 |
| `search-box` + `search-results` | ✓ | — | 目录专用 |
| `toc-list` | ✓ | — | 按篇分组 |
| `game-card` / `game-grid` | — | ✓ | 卡片拆为图片放大按钮与详情按钮 |
| `game-dialog` | — | ✓ | 单例，页面创建时挂载 |
| `image-lightbox` | — | ✓ | 单例，卡片/弹层图片共用，原生 dialog 叠层 |
| `intro` | — | ✓ | v0.2 文字章复用同一块渲染器 |
| `states`（骨架/空/错误） | ✓ | ✓ | 三处复用，文案由参数传入 |

### 7.4 样式约定

- 令牌集中在 `styles/tokens.css`，组件不得写死颜色。
- 类名 BEM：`.card`、`.card__title`、`.card--skeleton`；状态类用 `is-*`（`.is-active`）。
- 布局用 Grid/Flex；断点只在 `app.css` 定义三档，组件内不写 media query。
- 动效仅 hover 与弹层，`prefers-reduced-motion` 下关闭。

---

## 8. 构建与打包方案

### 8.1 结论：应用代码不打包

| 项 | 方案 |
|---|---|
| 模块加载 | 浏览器原生 `<script type="module">` + 相对路径 import |
| 依赖 | 0 个运行时依赖；0 个开发依赖 |
| 构建 | 仅数据构建：`node tools/extract-games.mjs` |
| 打包 | 无。源码即产物 |
| 压缩 | 不做；静态托管开启 gzip/brotli 即可 |
| 类型检查 | `jsconfig.json` + JSDoc + `// @ts-check`（编辑器内） |
| 测试 | `node --test`，只测纯函数与 repository |

理由：

1. 运行期模块约 18 个，HTTP/2 下并发请求成本可忽略。
2. 无构建意味着“浏览器看到的就是仓库里的代码”，排查问题不需要 source map。
3. 无 npm 依赖，供应链与升级成本为零；教学场景下也少一层黑箱。

代价与应对：

| 代价 | 应对 |
|---|---|
| 无 tree-shaking / 压缩 | 运行期 JS 未压缩总量受 `tools/budgets.mjs` 约束；托管层压缩 |
| 无 HMR | 改完刷新；数据改动重跑脚本 |
| import 路径手写 | 统一相对路径，禁止深层 `../../..` |
| 不支持旧浏览器 | 明确 targets；不支持 IE |

**切换到 Vite 的触发条件**：引入第三方 UI 库、需要 TypeScript、需要代码分割/SSR、模块数 > 50。

### 8.2 npm scripts

```json
{
  "private": true,
  "type": "module",
  "scripts": {
    "data": "node tools/extract-games.mjs",
    "check": "node tools/check-games.mjs",
    "serve": "python3 -m http.server 5173",
    "test": "node --test tests/"
  }
}
```

提交门禁是只读的 `npm run check && npm test`，由 `.githooks/pre-commit` 与 `.github/workflows/verify.yml` 执行。`npm run data` 会重写 `data/` 与 `assets/`，属于改稿流程，不进提交门禁。

### 8.3 资源与缓存

| 资源 | 策略 |
|---|---|
| HTML | `Cache-Control: no-cache`（托管默认即可） |
| `data/*.json` | 短缓存（5 分钟）或按 `bookVersion` 加查询参数；数据更新需刷新 |
| `assets/art/panel_web/**` | 长缓存（1 年）；文件名含编号，内容变更时同步换版本目录 |
| JS/CSS | 短缓存；v0.1 不做 hash 文件名 |

### 8.4 部署

- 全相对路径（`./src/app.js`、`./data/toc.json`），支持子目录部署。
- hash 路由不需要 404 重写。
- GitHub Pages：把 `babyGame/` 作为仓库根或 `docs/` 发布即可；无需 Actions 构建。
- CloudBase/对象存储：上传整目录，设置 `index.html` 为默认首页。
- 本地预览必须用 HTTP；直接双击 `index.html` 会因 `fetch` 与 ES module 的 `file://` 限制失败。

---

## 9. 数据契约与后端对接

### 9.1 v0.1：静态 JSON 即只读 API

**`data/toc.json`**

```jsonc
{
  "schemaVersion": 1,
  "bookVersion": "v1.4",
  "generatedAt": "2026-10-20T10:00:00+08:00",
  "book": { "title": "0-3岁亲子游戏图鉴", "subtitle": "130个游戏，把日常变成早教", "total": 130, "chapterCount": 14 },
  "parts": [
    { "no": 2, "title": "分月龄游戏图鉴", "chapterNos": [5, 6, 7, 8] },
    { "no": 3, "title": "把游戏放进生活", "chapterNos": [13, 14, 15, 16, 17, 18] }
  ],
  "chapters": [
    {
      "no": 5,
      "title": "0-3个月｜躺着的世界",
      "shortTitle": "躺着的世界",
      "age": "0-3月",
      "count": 10,
      "file": "chapters/ch05.json"
    }
  ],
  "gameIndex": [
    { "id": "01", "name": "黑白卡追视", "chapterNo": 5, "age": "0-3月", "ability": "认知探索" }
  ]
}
```

**`data/chapters/ch05.json`**

```jsonc
{
  "schemaVersion": 1,
  "no": 5,
  "title": "0-3个月｜躺着的世界",
  "partNo": 2,
  "age": "0-3月",
  "kind": "games",
  "intro": [
    { "type": "p", "text": "**发展地图**" },
    { "type": "ul", "items": ["大运动：俯卧能短暂抬头1-2秒……", "认知：……"] }
  ],
  "games": [
    {
      "id": "01",
      "name": "黑白卡追视",
      "age": "0-3月",
      "ageRange": { "min": 0, "max": 3 },
      "ability": "认知探索",
      "duration": "3-5分钟",
      "place": "床/地垫",
      "materials": "黑白卡3-5张",
      "people": "1对1",
      "play": "……",
      "steps": ["……", "……", "……", "……"],
      "observe": ["……", "……"],
      "up": "……",
      "down": "……",
      "safety": "……",
      "question": "……",
      "art": { "main": "assets/art/panel_web/001-1.jpg", "panels": ["assets/art/panel_web/001-1.jpg", "…-2.jpg", "…-3.jpg", "…-4.jpg"] }
      // main 与 panels[0] 相同：首张水彩图兼作卡片主图，4 张图供弹层与大图切换。
    }
  ]
}
```

约定：

- `intro` 块类型：`p`、`ul`、`ol`、`h3`、`h4`、`table`、`quote`。v0.1 只用到 `p`/`ul`，其余为 v0.2 文字章预留。
- 图片路径相对 `index.html`（浏览器按文档地址解析 `<img src>`，不按 JSON 文件地址），由构建期生成，页面不得自行拼接。
- `kind` 目前恒为 `"games"`；文字章为 `"prose"`，届时增加 `blocks` 字段。
- 数据版本变化时 `schemaVersion` 递增，`repository` 在解析后校验必要字段，缺失则抛 `SCHEMA` 错误。

### 9.2 数据访问层（前后端解耦点）

```js
export function createCatalogRepository({ baseUrl = './data', fetchImpl = fetch } = {}) {
  return {
    getToc(),
    getChapter(no),
    prefetchChapter(no)
  };
}
```

- 页面只依赖 `Toc`/`Chapter` 领域对象，不关心来源是 JSON 还是 REST。
- `getChapter` 内部用 `Map<number, Promise<Chapter>>` 缓存：并发去重、成功常驻、失败剔除。
- `prefetchChapter` 调用 `getChapter().catch(() => {})`，失败静默；只暖缓存，不写 store。
- 未来接后端时，新增 `createHttpCatalogRepository()`，`app.js` 换一行注入，UI 与 selector 不动。

### 9.3 未来 REST 契约（预留）

| 方法 | 路径 | 返回 |
|---|---|---|
| GET | `/api/v1/toc` | `{ data: Toc, meta: { version, generatedAt } }` |
| GET | `/api/v1/chapters/{no}` | `{ data: Chapter, meta: { version } }` |
| GET | `/api/v1/search?q=` | `{ data: SearchHit[] }`（v0.2，替换本地索引） |
| GET | `/api/v1/favorites` | 需鉴权，v0.3 |

错误响应统一为 `{ "error": { "code": "CHAPTER_NOT_FOUND", "message": "…" } }`，HTTP 状态语义化（400/404/500）。前端 `http.js` 归一为：

```js
AppError = { code: 'NETWORK'|'HTTP'|'PARSE'|'SCHEMA', status?, message, retryable }
```

UI 只按 `code` 决定文案与是否显示“重试”，不解析后端 message。

CORS：静态 JSON 无跨域；未来 API 与前端同域部署（CloudBase 同源或反向代理），v0.1 不设计鉴权。

---

## 10. 关键流程

### 10.1 首屏（目录）

```
浏览器打开 #/
  → app.bootstrap()
  → router.start() → parseHash('#/') = { name:'toc' }
  → store.route = toc
  → toc.status = loading → 渲染目录骨架
  → repository.getToc()  (GET data/toc.json)
  → toc.status = ready → selectTocView → renderTocPage
  → document.title = 'babyGame · 130个亲子游戏'
```

### 10.2 搜索

```
输入 → toc-page.onSearch(q)
  → app: store.setState({ query: q })
  → selectSearchResults(toc, q)   // 名称子串，忽略大小写与首尾空格
  → tocPage.update(state)         // 内部只替换结果区，输入框不重建
  → 点击结果 → navigate({ name:'chapter', chapterNo, gameId })
```

### 10.3 进入章节

```
navigate(#/ch/5) → hashchange → routeChanged
  → 若 toc 未加载：先 getToc()
  → chapters[5] 不存在 → status=loading → 骨架
  → repository.getChapter(5)
  → status=ready → selectChapterView
  → renderChapterPage → scrollTo(0,0) → h1.focus()
  → 空闲 1s：prefetchChapter(4), prefetchChapter(6)
```

### 10.4 打开/关闭弹层

```
点击卡片 → app.openGame('01')
  → router.navigate({ name:'chapter', chapterNo:5, gameId:'01' })  // push
  → routeChanged → 章节已就绪 → selectGame
  → dialog.open(game) → showModal() → 焦点到关闭按钮
关闭 → dialog.close() → router.navigate({ ..., gameId:null }, { replace:true })
  → 焦点回原卡片（记录触发元素）；深链进入则焦点回网格标题
```

### 10.5 上一章 / 下一章

```
click → selectNeighbors(toc, 5) = { prev:null, next:6 }
  → navigate(#/ch/6)  // push
  → 命中缓存：立即渲染；未命中：骨架 + 请求
  → 12 → 13 跨篇连续；5 的 prev、18 的 next 禁用
```

### 10.6 失败与重试

```
getChapter 失败 → AppError
  → chapters[5] = { status:'error', error }
  → 渲染错误块：文案 + 重试按钮
  → 重试 → chapterRequested(5) → getChapter(5)
toc 失败 → 目录页错误块 + 重试；不渲染空目录
图片 404 → onerror 换成同尺寸色块，卡片布局不塌
```

---

## 11. 响应式与可访问性

| 断点 | 目录 | 章节 | 弹层 |
|---|---|---|---|
| `<640px` | 单列，搜索框全宽 | 单列卡片，工具栏三按钮等分 | 全屏 sheet |
| `640-1023px` | 单列，最大宽 720px | 双列 | 90vw / 90vh |
| `≥1024px` | 单列，最大宽 820px | 三列，最大宽 1120px | 720px 居中 |

可访问性：

- 语义结构：`header` / `main` / `nav` / `h1`，skip link 首元素。
- 路由切换后焦点移动到新页 `h1`（`tabindex="-1"`），并更新 `document.title`。
- 弹层用原生 `<dialog>`，自带焦点圈定与 Esc；关闭后焦点回到触发元素。
- 搜索输入 `type="search"` + `aria-label`；结果计数用 `aria-live="polite"`。
- 卡片拆为图片按钮与详情按钮，均可 Enter/Space；图片 `alt`：卡片内为空（按钮名称已含游戏名），弹层为“{游戏名}示意图”。
- 图片大图用第二个原生 `<dialog>` 叠层，支持滚轮/双指缩放、拖拽平移、`+/-/0` 与左右键；Esc 只关闭顶层，焦点回到被点击图片。
- 对比度 ≥ 4.5:1；焦点环不可移除；`prefers-reduced-motion` 关闭过渡。
- 键盘：目录页 `Tab` 顺序自然；章节页 `←/→` 切章（输入框内不拦截）、`Esc` 关弹层。

---

## 12. 性能预算

| 指标 | 预算 |
|---|---|
| `toc.json` / 单章 JSON / 运行期 JS（未压缩） | 阈值定义在 `tools/budgets.mjs`。`npm run check` 与 `npm test` 直接读它，本节不重抄数字 |
| 首屏请求数 | 1 HTML + 1 CSS + 1 JS 入口（模块并行）+ 1 toc.json |
| 首屏可交互 | 本地 < 1s；4G < 2.5s |
| 切章（缓存命中） | < 50ms |
| 切章（未命中） | 骨架 < 100ms 出现；内容随网络 |
| CLS | < 0.02（图片容器固定比例） |

手段：章节 JSON 按章拆分；图片懒加载；相邻章预取；章节缓存常驻；卡片列表不做虚拟滚动（单章游戏数受 `tools/budgets.mjs` 的 `MAX_GAMES_PER_CHAPTER` 约束）。

---

## 13. 质量保障

### 13.1 自动化

| 检查 | 方式 |
|---|---|
| 数据完整性 | `node tools/check-games.mjs`：130 条、字段、枚举、资源存在、体积预算 |
| 路由解析 | `node --test`：合法/非法/补零/越界 |
| selector | 搜索大小写、空白、无结果、相邻章边界（5/18/12→13） |
| zoom | 比例边界、指针锚点缩放、连续缩放、平移范围限制、1 倍判定容差 |
| repository | 假 fetch：成功、404、坏 JSON、并发去重、失败不缓存 |
| 发布预算 | `tests/release.test.mjs`：三处体积、相对路径、`innerHTML` |
| 编码规范 | `tests/standards.test.mjs`：十六进制颜色只在 `tokens.css`、每个 `<img>` 声明 `decoding` |

### 13.2 手动验收

- [ ] 360px / 768px / 1440px 三档无横向滚动
- [ ] 首屏 Network 只有 `toc.json`，无章节 JSON
- [ ] 进入第 5 章后才出现 `ch05.json`；1s 后出现 `ch04/ch06`（预取）
- [ ] 目录 → 章节 → 目录，两次点击内完成
- [ ] 第 12 章“下一章”进入第 13 章；第 5 章“上一章”禁用
- [ ] 搜索“躲猫猫”命中并直达对应游戏弹层
- [ ] 深链 `#/ch/10/game/76` 刷新后仍打开正确弹层
- [ ] 后退关闭弹层，再后退回到目录
- [ ] 关闭弹层后焦点回到原卡片
- [ ] 断网后进入新章节显示错误块与重试按钮

---

## 14. 关键架构决策与权衡

| 决策 | 备选 | 选型理由 | 代价 | 重估触发 |
|---|---|---|---|---|
| 原生 SPA + 无框架 | React/Vue、MPA | 2 页面、5 类状态，框架收益低；链路透明、零依赖 | 显式 DOM 更新；无生态 | 模块 > 50、需 SSR、多人并行 |
| hash 路由 | History API、多 HTML | 静态托管零配置；深链可用；无需 404 重写 | URL 含 `#`；SEO 弱 | 需要搜索引擎收录 |
| 一章一 JSON | 单文件全量、按游戏拆分 | 首屏只请求目录；章节缓存粒度合适 | 跨章搜索依赖索引 | 章节数 > 100 或内容 > 1 MB |
| 目录内嵌游戏名索引 | 独立 `search.json`、全量加载 | 少一次请求；约 10 KB | TOC 随内容增长 | 索引 > 100 KB |
| 详情用 `<dialog>` | 独立详情页 | 保留滚动与上下文；少一次数据加载 | 分享仍是深链，可接受 | 需要独立 SEO 页 |
| DOM 函数组件 | 模板字符串、Web Components | `textContent` 天然防注入；组合直观 | 无响应式绑定 | 组件状态变复杂 |
| 构建期解析 Markdown | 浏览器内解析 | 运行期零依赖；JSON 契约稳定 | 改稿需重跑脚本 | 需要在线编辑内容 |
| Repository 接口 | 页面直接 fetch | 后端可替换；可注入假 fetch 测试 | 多一层约 30 行 | 接口形态稳定后可简化 |
| 空闲预取相邻章 | 严格按需 | 翻章接近即时 | 每次多看 1-2 个请求 | 流量敏感场景可关闭 |
| 不打包 | Vite/Rollup | 18 个模块、HTTP/2 足够；零构建 | 无压缩与 HMR | 引入依赖或 TS |

---

## 15. 模块依赖矩阵

行 = 发起方，列 = 被依赖方；`✓` 允许，空 = 禁止。

|  | core | domain | data | state | ui | pages | app |
|---|---|---|---|---|---|---|---|
| core | ✓ |  |  |  |  |  |  |
| domain |  | ✓ |  |  |  |  |  |
| data | ✓ |  | ✓ |  |  |  |  |
| state | ✓ | ✓ |  | ✓ |  |  |  |
| ui | ✓ | ✓ |  |  | ✓ |  |  |
| pages | ✓ | ✓ |  |  | ✓ | ✓ |  |
| app | ✓ | ✓ | ✓ | ✓ |  | ✓ |  |

约束由 code review 保证；M4 可加 `tools/check-imports.mjs` 做静态扫描，把规则变成 CI 检查。

---

## 16. 里程碑与验收

| 里程碑 | 范围 | 验收 | 教学对应 |
|---|---|---|---|
| M1 数据层 | 提取器、校验器、`toc.json`、14 章 JSON、插画 | 130 条 0 错误；单章文件可独立打开；`node --test` 通过 | 第 1 课：数据与视图分离 |
| M2 应用壳 + 目录 | `index.html`、router、store、repository、目录页 | `#/` 只加载 toc；14 章分组正确；搜索命中 | 第 2 课：路由与加载 |
| M3 章节 + 导航 | 章节页、工具栏、相邻章、预取、骨架 | 三档断点；12→13；切章回顶；缓存命中 < 50ms | 第 3 课：状态与派生 |
| M4 详情 + 打磨 | 弹层、深链、焦点、错误态、验收清单 | 手动验收全过；无横向滚动；深链刷新正确 | 第 4 课：边界与可访问性 |

每个里程碑结束产出可运行版本，验收通过再进入下一段。M1 不依赖任何 UI，可先独立完成并校验数据。

---

## 17. 风险

| 风险 | 影响 | 应对 |
|---|---|---|
| 稿件格式变化 | 提取失败 | 校验器定位到编号；JSON 契约隔离浏览器代码 |
| 水彩 JPG 体积或缺失 | 图文错位 | 构建期检查存在性；`onerror` 色块兜底；固定宽高比 |
| 预取被误解为加载多章 | 需求争议 | 预取只暖缓存、不渲染；可一行关闭 |
| 无框架导致页面耦合 | 维护成本上升 | 依赖矩阵 + 页面对象契约 + review |
| 静态托管缓存旧 JSON | 内容不更新 | 短缓存或 `bookVersion` 查询参数 |
| hash 链接在聊天工具被截断 | 分享失效 | 提供“复制链接”按钮（v0.2） |

---

## 18. 待落地清单

1. 生成 `data/toc.json` 与 14 个章节 JSON，确认字段与本文一致。
2. 实现 `core/dom.js`、`core/router.js`、`core/store.js`，先用假数据跑通目录页。
3. 实现 `data/repository.js` 与缓存，验证“首屏只请求 toc”。
4. 实现章节页、工具栏、相邻章与预取。
5. 实现弹层、深链、焦点与错误态。
6. 按第 13.2 节逐条验收。
