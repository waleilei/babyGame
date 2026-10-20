# babyGame v0.3 前端架构方案

> 状态：已实现（v0.2 全书章节补齐） ｜ 版本：0.3 ｜ 日期：2026-10-20
> 依据需求：全书 28 个文档连续阅读；一次只加载一个文档；目录、文档、相邻页之间快速跳转
> 前序文档：`docs/design.md`（v0.1，已归档）、`docs/adr/0001-doc-model-and-routes.md`

---

## 0. 摘要

| 项 | 结论 |
|---|---|
| 应用形态 | 纯静态单页应用（SPA），无框架、无打包器、原生 ES Modules |
| 内容范围 | 全书 28 个文档：前置 1 + 第 1-21 章 + 附录 A-F；其中第 5-18 章是游戏章（130 个游戏） |
| 路由 | hash 路由：`#/`、`#/front`、`#/ch/{1..21}`、`#/ch/{n}/game/{id}`、`#/appendix/{a..f}` |
| 数据 | 构建期把 8 份 Markdown 提取为 `toc.json` + 28 个文档 JSON（`data/chapters/` 与 `data/docs/`） |
| 加载 | 首屏只加载 `toc.json`；进入文档只加载该文档 JSON；空闲时预取前后各一个文档 |
| 状态 | 单一 store + 纯函数 selector + 单向数据流；URL 是导航状态的唯一来源 |
| 文字章 | 块契约（段落/标题/列表/表格/引用/清单）+ 块渲染器 + 小节导航 + 本地清单状态 |
| 详情 | 游戏章页内的原生 `<dialog>`，深链可直达；文字章没有弹层 |
| 部署 | 任意静态托管，相对路径 + hash，无需服务器重写 |
| 后端 | 无后端；静态 JSON 通过 `CatalogRepository` 接口提供，未来可替换为 REST |

---

## 1. 需求与已确认决策

### 1.1 功能性需求

| 编号 | 需求 | 验收口径 |
|---|---|---|
| R1 | PC 与手机自适应 | 360px 无横向滚动；≥1024px 三列卡片、正文 + 侧边小节导航；弹层手机全屏 |
| R2 | 一次只加载一个文档 | 首屏只请求 `toc.json`；文档页只请求该文档 JSON；渲染树中只有一个文档 |
| R3 | 目录 ↔ 文档 | 目录 28 行按 6 组分组；文档内“目录”一次点击返回；深链可直达 |
| R4 | 相邻页 | 上一页/下一页按全书顺序推进；4→5、12→13、18→19、21→附录A 连续；首尾禁用 |
| R5 | 目录搜索 | 130 个游戏名 + 28 个文档标题；结果区分游戏/章节/附录/前置，点击直达 |
| R6 | 游戏详情 | 8 个模块完整；4 张步骤图；关闭后回到原卡片位置 |
| R7 | 文字章阅读 | 标题、表格、清单、引用、跨块编号与稿件一致；宽表横向滚动且首列可见 |
| R8 | 清单勾选 | 附录 B 37 项可勾选；刷新后保留；支持重置本页勾选 |

### 1.2 已确认的设计决策

| 编号 | 决策 | 说明 |
|---|---|---|
| D1 | 全书统一为“文档” | `docs[]` 是唯一有序列表；分组只引用 id；见 ADR-0001 |
| D2 | SPA + hash 路由 | 不需要 SEO；静态托管零配置；切换无整页刷新 |
| D3 | 目录独立成页 | `#/` 为目录；文档页顶部固定“目录 / 上一页 / 下一页” |
| D4 | 搜索覆盖游戏与文档 | 索引内嵌 `toc.json`；排序为完全匹配 → 前缀 → 包含 |
| D5 | 详情用 `<dialog>` | 保留章节滚动位置；深链 `#/ch/5/game/01` |
| D6 | 相邻页线性、跨篇、不循环 | `front → ch01 … ch21 → apx-a … apx-f` |
| D7 | 空闲预取相邻文档 | 文档渲染后 1s 预取前后文档，只暖缓存、不渲染 |
| D8 | 切页回顶部并对焦标题 | 弹层关闭恢复卡片焦点；目录回顶部 |
| D9 | 游戏章显示章首导语 | 构建期把“发展地图/场景说明”解析为 `intro` 块 |
| D10 | 目录不显示配图 | 每行显示编号/标题/meta（月龄或“阅读”）与游戏数；首屏保持轻量 |
| D11 | 本地 + GitHub Pages 可用 | 全相对路径 + hash；未来接 CloudBase 不改代码 |
| D12 | 三档断点、桌面方向键 | `<640` / `640-1023` / `≥1024`；`←/→` 切页、`Esc` 关弹层；不做滑动手势 |
| D13 | 游戏章与文字章并列渲染 | 共用文档页外壳（工具栏/骨架/相邻页/页脚），正文各一套渲染器 |
| D14 | 小节导航用按钮 | 不吃 hash；`scrollIntoView` + `scroll-margin-top`；桌面侧栏、移动端 `<details>` |
| D15 | 清单状态存本地 | `babyGame:checklist:{docId}`；只存已勾选项；不可用时静默降级 |

---

## 2. 整体架构模式与分层

### 2.1 模式

**静态 SPA + 四层模块化**。不引入框架，但用目录与 import 方向强制分层，避免退化成“一个 app.js 打天下”。

```
┌────────────────────── 构建期（Node，离线执行） ──────────────────────┐
│  manuscript/front-matter.md … appendix.md（8 份）                    │
│        │ tools/extract-games.mjs                                     │
│        ▼                                                             │
│  data/toc.json                                                       │
│  data/chapters/ch01.json … ch21.json（21 个编号章）                  │
│  data/docs/front.json、apx-a.json … apx-f.json（7 个无编号文档）      │
│  assets/art/panel_web/**                                             │
│        │ tools/check-games.mjs（独立复检产物）                        │
└────────┼─────────────────────────────────────────────────────────────┘
         │ 静态文件（HTTP）
┌────────▼──────────────── 运行期（浏览器） ───────────────────────────┐
│                                                                      │
│  app.js（组合根 / 路由 / 编排）                                       │
│    ├─ pages/toc-page.js          ──┐                                 │
│    ├─ pages/doc-page.js            │ 展示层                           │
│    │     ├─ pages/games-body.js    │                                 │
│    │     ├─ pages/prose-body.js    │                                 │
│    │     └─ ui/*                   │                                 │
│    ├─ domain/*（纯函数）           │ 领域层                           │
│    ├─ data/repository.js           │ 数据层                           │
│    └─ state/store.js               │ 应用状态                         │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### 2.2 分层职责与依赖规则

| 层 | 目录 | 职责 | 允许依赖 | 禁止 |
|---|---|---|---|---|
| 组合根 | `src/app.js` | 启动、订阅路由、调度加载、组装页面 | 全部 | 写具体 UI 细节 |
| 页面层 | `src/pages/` | 页面级布局、组合组件、绑定页面事件；`doc-page` 负责文档页外壳，`games-body` / `prose-body` 各渲染一种正文 | core、domain、ui | 直接 fetch、直接改 store 内部 |
| 展示层 | `src/ui/` | 无状态组件与可复用视觉单元 | core、domain（纯函数） | 读取全局状态、发请求 |
| 领域层 | `src/domain/` | 路由解析、搜索、相邻章、视图模型 | 无（纯函数） | 触碰 DOM、fetch、window |
| 数据层 | `src/data/` | 加载、缓存、DTO → 领域对象、错误归一 | core/http | 触碰 DOM、读取页面状态 |
| 基础设施 | `src/core/` | DOM 构造、store、router、focus、idle | 无（router 接触 location） | 含业务规则 |
| 构建期 | `tools/` | 解析稿件、校验、写 JSON、复制插画 | Node 内置模块 | 被浏览器代码 import |

依赖方向只能自上而下。`domain` 不 import 任何运行时代码，因此可以用 `node --test` 直接测试。

### 2.3 为什么不用框架

| 维度 | 本项目 |
|---|---|
| 页面数 | 2 类（目录、文档），文档页有两种正文渲染器 |
| 状态数 | 1 个 store，5 类动作 |
| 数据量 | 28 个文档、130 条游戏，单文档最大约 18 KB |
| 交互 | 路由切换、搜索过滤、弹层开关、预取、清单勾选 |

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
│   │   ├── local-store.js        # localStorage 读写适配与静默降级
│   │   └── idle.js               # requestIdle 兼容封装
│   ├── domain/
│   │   ├── route.js              # resolveRoute 文档路由校验
│   │   ├── catalog.js            # 分组、相邻页、游戏 + 文档搜索
│   │   ├── checklist.js          # 清单键、编码解码、越界键过滤
│   │   ├── zoom.js               # 缩放比例、锚点缩放、平移边界
│   │   └── format.js             # 计数、文档标签、搜索结果标签
│   ├── data/
│   │   ├── http.js               # getJSON + 错误归一
│   │   └── repository.js         # CatalogRepository + 缓存 + 预取暖缓存
│   ├── state/
│   │   ├── store.js              # 初始 state
│   │   └── selectors.js          # 纯函数视图模型
│   ├── ui/
│   │   ├── toolbar.js            # 目录 / 上一页 / 下一页
│   │   ├── doc-footer.js         # 页脚上一页 / 下一页
│   │   ├── toc-list.js           # 按 6 个分组列出的文档列表
│   │   ├── search-box.js
│   │   ├── search-results.js
│   │   ├── blocks.js             # 文字章块渲染（表格/清单/引用）
│   │   ├── section-nav.js        # 桌面侧栏 + 移动端 details
│   │   ├── game-card.js          # 图片放大 + 详情双按钮
│   │   ├── game-grid.js
│   │   ├── game-dialog.js
│   │   ├── image-lightbox.js     # 大图缩放/平移/切换
│   │   ├── intro.js              # 章首导语块渲染
│   │   └── states.js             # skeleton / empty / error
│   └── pages/
│       ├── toc-page.js
│       ├── doc-page.js           # 文档页外壳：工具栏、页脚、弹层、方向键
│       ├── games-body.js         # 游戏章正文：导语 + 卡片网格
│       └── prose-body.js         # 文字章正文：页头 + 小节导航 + 块
├── data/
│   ├── toc.json                  # 目录 + 28 个文档 + 130 条游戏名索引
│   ├── chapters/ch01.json … ch21.json
│   └── docs/front.json、apx-a.json … apx-f.json
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

估算代码量：运行期约 2,350 行（不含 CSS），构建期约 1,230 行，样式约 1,900 行（含 v0.1 的大图查看器）。

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
  getDoc(docId: string, opts?: { signal }): Promise<Doc>,
  prefetchDoc(docId: string): void
}

// domain/catalog.js
export function groupDocs(toc): Group[]
export function selectNeighbors(toc, docId): { prev, next }
export function searchCatalog(toc, query): SearchHit[]

// domain/checklist.js
export function collectChecklistItems(blocks): ChecklistItem[]
export function decodeChecklistState(raw): Set<string>
export function encodeChecklistState(keys): string
export function sanitizeChecklistKeys(keys, blocks): Set<string>

// state/selectors.js
export function selectTocView(state): TocView
export function selectDocView(state, docId): DocView

// pages/*.js
export function createTocPage(props): { el, update(view), focusTitle(), destroy() }
export function createDocPage(props): { el, update(view), focusTitle(), destroy() }
```

JSDoc 类型就近写在模块里，配合 `jsconfig.json` 获得编辑器校验，不引入 TypeScript 构建。

### 4.2 模块职责

| 模块 | 关键职责 | 明确不做 |
|---|---|---|
| `app.js` | 初始化 store/router；处理路由；调度 toc/doc 加载；挂载页面；设置标题；预取 | 不实现卡片、弹层、块排版细节 |
| `pages/toc-page.js` | 目录布局、搜索框、结果区、分组列表；维护输入焦点 | 不发请求、不改 URL |
| `pages/doc-page.js` | 文档页外壳：工具栏、骨架/错误、页脚、弹层/大图生命周期、方向键 | 不渲染正文块 |
| `pages/games-body.js` | 游戏章页头、导语、卡片网格 | 不计算相邻页（用 selector） |
| `pages/prose-body.js` | 文字章页头、小节导航、块渲染、清单状态 | 不发请求 |
| `ui/blocks.js` | 块 → 语义 DOM；表格滚动区域、清单复选框 | 不判断加载状态 |
| `ui/section-nav.js` | 小节导航按钮与响应式两套容器 | 不改 URL |
| `ui/game-card.js` | 单卡结构与点击回调 | 不判断筛选 |
| `ui/game-dialog.js` | `<dialog>` 生命周期、8 模块排版、焦点管理 | 不加载数据 |
| `domain/catalog.js` | 搜索匹配与排序、相邻页、分组、计数 | 不读写 DOM |
| `domain/checklist.js` | 清单键、编码解码、越界键过滤 | 不碰 localStorage |
| `data/repository.js` | 请求、缓存、并发去重、DTO 校验、错误归一 | 不感知路由 |
| `core/local-store.js` | 读写本地字符串、失败静默降级 | 不定义键格式与编码 |
| `state/store.js` | 初始状态与状态动作 | 不渲染 |
| `state/selectors.js` | 由 state 派生视图模型 | 无副作用 |

---

## 5. 状态管理与数据流

### 5.1 State 形状

```js
{
  route: { name: 'toc' }
       | { name: 'doc', docId: 'ch05', gameId: null | '01' },

  toc: { status: 'idle'|'loading'|'ready'|'error', data: Toc|null, error: null|AppError },

  docs: {
    ch05: { status: 'idle'|'loading'|'ready'|'error', data: Doc|null, error: AppError|null }
  },

  query: ''   // 目录搜索词，仅 UI 状态，不写入 URL
}
```

设计要点：

- **路由状态只存一份**：`route` 是导航的唯一来源，弹层开关由 `route.gameId` 派生，不另设 `isDialogOpen`。
- **文档数据按 id 缓存**：`docs` 是普通对象，不用 `Map`，便于浅合并与调试。
- **搜索词不进 URL**：刷新后清空，避免与路由参数耦合。
- **不做全局 loading**：每个资源独立 `status`，目录与文档可分别显示骨架屏。
- **清单状态不进 store**：属于单文档本地持久化，由文字章页面持有；避免路由切换时产生无意义的全局刷新。

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
| `routeChanged(route)` | hashchange / navigate | 设置 route；按需加载 toc/doc；渲染 |
| `tocLoaded(data)` / `tocFailed(err)` | repository 返回 | 更新 `toc.status` |
| `docRequested(docId)` | 路由需要文档 | `docs[docId].status = loading` |
| `docLoaded(docId, data)` / `docFailed(docId, err)` | repository 返回 | 更新该文档状态；触发预取 |
| `searchChanged(query)` | 搜索输入 | 更新 `query`，仅刷新结果区 |
| `retryDoc(docId)` | 错误块重试 | 删除该文档状态后重新走 `routeChanged` |

---

## 6. 路由与页面组织

### 6.1 路由表

| hash | 页面 | 加载内容 |
|---|---|---|
| `#/` 或空 | 目录 | `toc.json` |
| `#/front` | 前置 | `toc.json`（若未加载）+ `docs/front.json` |
| `#/ch/5` | 文档 | `toc.json`（若未加载）+ `chapters/ch05.json` |
| `#/ch/5/game/01` | 游戏章 + 弹层 | 同上，加载完成后打开弹层 |
| `#/appendix/a` | 附录 | `toc.json` + `docs/apx-a.json` |

规则：

- 章节号解析为整数，URL 用不补零的 `5`；文件名补零 `ch05.json`，由 `toc.docs[].file` 给出。
- 前置固定 `#/front`；附录字母大小写不敏感，归一为小写。
- 游戏 id 保留两位字符串（`01`），与数据契约一致。
- 非法 hash（空段、非数字）：`history.replaceState` 回 `#/`，并显示 toast「页面地址无效」。
- 越界章号、不存在的附录：回到目录并提示；游戏 id 不属于该文档：回到该文档并提示。
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
<header class="toc-hero">        标题 + 副标题 + 130个游戏 / 21章 / 28个文档
<section class="search">         搜索框 + 结果区
<nav class="toc">                6 个分组
  <section class="toc__part">    前置 / 第一篇 … / 附录
    <a class="toc-row">          编号 / 标题 / meta（月龄或“阅读”）/ 游戏数
```

**文档页外壳**

```
<header class="chapter-bar">     目录 ｜ 上一页 ｜ 下一页（sticky）
<div class="doc-body">           游戏章正文或文字章正文
<div class="doc-state">          骨架 / 错误
<footer class="chapter-footer">  上一页 / 下一页
<dialog class="game-dialog">     游戏详情（仅游戏章）
<dialog class="image-lightbox">  大图（仅游戏章）
```

**游戏章正文**

```
<h1>第5章 0-3个月｜躺着的世界</h1>
<p class="chapter__meta">0-3月 · 10个游戏</p>
<section class="intro">          发展地图 / 场景说明
<ul class="game-grid">           游戏卡片
```

**文字章正文**

```
<header class="prose-head">      所属篇 / h1 / meta（阅读或附录） / 重置勾选
<details class="section-nav--mobile">  本页目录
<div class="prose-layout">
  <article class="prose">        段落 / 标题 / 列表 / 表格 / 引用 / 清单
  <aside><nav class="section-nav--desktop">  吸顶小节导航
```

### 6.3 页面生命周期

| 时机 | 行为 |
|---|---|
| 进入目录 | 若无 toc 则加载；渲染；滚动到顶部；标题 `0-3岁亲子游戏图鉴 · 130个游戏` |
| 进入文档 | 确保 toc；加载文档；渲染骨架；成功后 `scrollTo(0,0)` 并把焦点放到 `h1` |
| 章内打开弹层 | 不重新加载文档；`showModal()`；焦点进入关闭按钮 |
| 关闭弹层 | `close()`；`replace` 回 `#/ch/5`；焦点回卡片 |
| 上一/下一页 | `push` 新 hash；命中缓存则立即渲染，否则骨架 |
| 浏览器后退 | 交给 hashchange；弹层状态由 route 派生，不额外处理 |
| 勾选清单 | 只更新 DOM 与 localStorage，不进 store、不重建页面 |

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
- 所有文本用 `textContent`/`el()` 写入，**禁止把数据拼进 `innerHTML`**；行内粗体由 `ui/blocks.js` 的 `inline()` 先按 `**` 切段再逐段建节点。
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

| 组件 | 目录页 | 游戏章 | 文字章 | 说明 |
|---|---|---|---|---|
| `toolbar` | — | ✓ | ✓ | 固定三段：目录 / 上一页 / 下一页，标签来自 `docLabel` |
| `doc-footer` | — | ✓ | ✓ | 页脚上一页 / 下一页，与工具栏同源 |
| `search-box` + `search-results` | ✓ | — | — | 目录专用，结果含游戏与文档 |
| `toc-list` | ✓ | — | — | 6 个分组、28 行 |
| `game-card` / `game-grid` | — | ✓ | — | 卡片拆为图片放大按钮与详情按钮 |
| `game-dialog` | — | ✓ | — | 懒创建；页面销毁时一并销毁 |
| `image-lightbox` | — | ✓ | — | 懒创建；卡片/弹层图片共用 |
| `intro` | — | ✓ | — | 只在游戏章导语使用 |
| `blocks` | — | — | ✓ | 段落/标题/列表/表格/引用/清单 |
| `section-nav` | — | — | ✓ | 桌面侧栏 + 移动端 `<details>` |
| `states`（骨架/空/错误） | ✓ | ✓ | ✓ | 三处复用，文案由参数传入 |

### 7.4 样式约定

- 令牌集中在 `styles/tokens.css`，组件不得写死颜色。
- 类名 BEM：`.card`、`.card__title`、`.card--skeleton`；状态类用 `is-*`（`.is-active`）。
- 布局用 Grid/Flex；断点只在 `app.css` 定义三档，组件内不写 media query。
- 动效仅 hover 与弹层，`prefers-reduced-motion` 下关闭。
- 文字章正文用衬线字体、约 38em 行宽；段落不缩进，用段间距分隔。
- 表格容器 `overflow-x:auto`、`role="region"`、`tabindex="0"`，首列 `position:sticky`；表头不吸顶。
- 清单用原生 `<input type="checkbox">` + `<label>`；清单块带 `aria-label`。
- `[hidden]` 在 `base.css` 统一 `display:none !important`，避免组件 `display` 覆盖隐藏。

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
    "test": "node --test tests/*.test.mjs"
  }
}
```

提交门禁是只读的 `npm run check && npm test`，由 `.githooks/pre-commit` 与 `.github/workflows/verify.yml` 执行。`npm run data` 会重写 `data/` 与 `assets/`，属于改稿流程，不进提交门禁。

### 8.3 资源与缓存

| 资源 | 策略 |
|---|---|
| HTML | `Cache-Control: no-cache`（托管默认即可） |
| `data/toc.json`、`data/chapters/*.json`、`data/docs/*.json` | 短缓存（5 分钟）或按 `bookVersion` 加查询参数；数据更新需刷新 |
| `assets/art/panel_web/**` | 长缓存（1 年）；文件名含编号，内容变更时同步换版本目录 |
| JS/CSS | 短缓存；不做 hash 文件名 |

### 8.4 部署

- 全相对路径（`./src/app.js`、`./data/toc.json`），支持子目录部署。
- hash 路由不需要 404 重写。
- GitHub Pages：把 `babyGame/` 作为仓库根或 `docs/` 发布即可；无需 Actions 构建。
- CloudBase/对象存储：上传整目录，设置 `index.html` 为默认首页。
- 本地预览必须用 HTTP；直接双击 `index.html` 会因 `fetch` 与 ES module 的 `file://` 限制失败。

---

## 9. 数据契约与后端对接

### 9.1 v0.2：静态 JSON 即只读 API

**`data/toc.json`**

```jsonc
{
  "schemaVersion": 2,
  "bookVersion": "v1.4",
  "generatedAt": "2026-10-20T10:00:00.000Z",
  "book": {
    "title": "0-3岁亲子游戏图鉴",
    "subtitle": "130个游戏，把日常变成早教",
    "total": 130,
    "chapterCount": 21,
    "docCount": 28
  },
  "groups": [
    { "id": "front", "title": "前置", "docIds": ["front"] },
    { "no": 1, "id": "part-1", "title": "会玩的孩子", "docIds": ["ch01", "ch02", "ch03", "ch04"] },
    { "id": "appendix", "title": "附录", "docIds": ["apx-a", "…", "apx-f"] }
  ],
  "docs": [
    {
      "id": "ch05", "no": 5, "kind": "games",
      "title": "0-3个月｜躺着的世界", "shortTitle": "躺着的世界",
      "meta": "0-3月", "count": 10, "file": "chapters/ch05.json"
    },
    {
      "id": "front", "no": null, "kind": "prose",
      "title": "前置｜序、使用说明、发展地图", "shortTitle": "序、使用说明、发展地图",
      "meta": "阅读", "count": 0, "file": "docs/front.json"
    }
  ],
  "gameIndex": [
    { "id": "01", "name": "黑白卡追视", "docId": "ch05", "chapterNo": 5, "age": "0-3月", "ability": "认知探索" }
  ]
}
```

`docs` 是唯一有序列表；`groups[].docIds` 只引用 id，顺序必须与 `docs` 一致且恰好覆盖每个文档一次。目录行只用 `docs[]` 的字段，不再引入 `partId`。

**`data/chapters/ch05.json`（游戏章）**

```jsonc
{
  "schemaVersion": 2,
  "id": "ch05",
  "no": 5,
  "kind": "games",
  "title": "0-3个月｜躺着的世界",
  "partId": "part-2",
  "meta": "0-3月",
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

**`data/docs/apx-b.json`（文字章）**

```jsonc
{
  "schemaVersion": 2,
  "id": "apx-b",
  "no": null,
  "kind": "prose",
  "title": "附录B 家庭安全排查清单",
  "partId": "appendix",
  "meta": "附录",
  "blocks": [
    { "type": "p", "text": "**使用方法**：蹲下来，用孩子的视角看一遍房间。" },
    { "type": "h4", "text": "睡眠区" },
    { "type": "checklist", "items": [{ "text": "床内无枕头、被子、毛绒玩具、床围", "checked": false }] },
    { "type": "table", "head": ["月龄", "重点区域"], "rows": [["0-6个月", "睡眠环境、抱姿与拍嗝"]] }
  ],
  "sections": [
    { "id": "s1", "level": 4, "title": "睡眠区" }
  ]
}
```

块契约：

| 块 | 字段 | 生成规则 |
|---|---|---|
| `p` | `text` | 连续非空行合并为一段；段内 `\n` 渲染为 `<br>` |
| `h2` | `text` | 仅前置的三个 `##` 标题 |
| `h3` | `text` | `###` 标题 |
| `h4` | `text` | `####`，或“整段只有一个 `**…**`、不以 `。！？；` 结尾、不超过 40 字”的伪标题 |
| `ul` | `items` | `- ` 项；`- [ ]` 走清单 |
| `ol` | `start`、`items` | `1. ` 项；`start` 保留跨块编号 |
| `table` | `head`、`rows` | 首个 `|` 行为表头，分隔行丢弃；列数必须一致 |
| `quote` | `text` | `>` 行合并为一个块，`\n` 保留 |
| `checklist` | `items[{text,checked}]` | `- [ ]` / `- [x]`；块内项不得为空 |

约定：

- 行内只允许 `**粗体**`；链接、图片、代码、斜体、原始 HTML 一律构建失败，不静默丢弃。
- 连续非空行按同一段落处理，段内换行渲染为 `<br>`；空行分段。这是为了保留附录 E 童谣的行结构（对应验收点「童谣段落保留换行」）。
- 图片路径相对 `index.html`（浏览器按文档地址解析 `<img src>`，不按 JSON 文件地址），由构建期生成，页面不得自行拼接。
- `sections` 由标题块按顺序派生，`id` 为 `s1…sn`，供页内导航使用；不产生 URL 深链。
- 全文按 8 份稿件提取；第一个章标题之前、最后一个章标题之后的内容归入相邻文档，`# 第X篇` 标题只用于确定分组。
- 数据版本变化时 `schemaVersion` 递增，`repository` 在解析后校验必要字段，缺失则抛 `SCHEMA` 错误。
- 旧版本章节/文档文件若不再被目录引用，`npm run data` 会清理，避免产物漂移。

### 9.2 数据访问层（前后端解耦点）

```js
export function createCatalogRepository({ baseUrl = './data', fetchImpl = fetch } = {}) {
  return {
    getToc(),
    getDoc(docId),
    prefetchDoc(docId)
  };
}
```

- 页面只依赖 `Toc`/`Doc` 领域对象，不关心来源是 JSON 还是 REST。
- `getDoc` 先从 `toc.docs[].file` 解析路径，再用 `Map<string, Promise<Doc>>` 缓存：并发去重、成功常驻、失败剔除。
- `prefetchDoc` 调用 `getDoc().catch(() => {})`，失败静默；只暖缓存，不写 store。
- 未来接后端时，新增 `createHttpCatalogRepository()`，`app.js` 换一行注入，UI 与 selector 不动。

### 9.3 未来 REST 契约（预留）

| 方法 | 路径 | 返回 |
|---|---|---|
| GET | `/api/v1/toc` | `{ data: Toc, meta: { version, generatedAt } }` |
| GET | `/api/v1/docs/{id}` | `{ data: Doc, meta: { version } }` |
| GET | `/api/v1/search?q=` | `{ data: SearchHit[] }`（替换本地索引） |
| GET | `/api/v1/favorites` | 需鉴权，后续版本 |

错误响应统一为 `{ "error": { "code": "DOC_NOT_FOUND", "message": "…" } }`，HTTP 状态语义化（400/404/500）。前端 `http.js` 归一为：

```js
AppError = { code: 'NETWORK'|'HTTP'|'PARSE'|'SCHEMA', status?, message, retryable }
```

UI 只按 `code` 决定文案与是否显示“重试”，不解析后端 message。

CORS：静态 JSON 无跨域；未来 API 与前端同域部署（CloudBase 同源或反向代理），当前不设计鉴权。

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
  → document.title = '0-3岁亲子游戏图鉴 · 130个游戏'
```

### 10.2 搜索

```
输入 → toc-page.onSearch(q)
  → app: store.setState({ query: q })
  → searchCatalog(toc, q)   // 游戏名 + 文档标题，忽略大小写与首尾空格
  → 排序：完全匹配 → 前缀 → 包含；同分按全书顺序；同文档内游戏在文档之前
  → tocPage.update(state)   // 内部只替换结果区，输入框不重建
  → 点击结果 → navigate({ name:'doc', docId, gameId? })
```

### 10.3 进入文档

```
navigate(#/ch/5) → hashchange → routeChanged
  → 若 toc 未加载：先 getToc()
  → docs['ch05'] 不存在 → status=loading → 骨架
  → repository.getDoc('ch05')
  → status=ready → selectDocView → doc-page.update
  → 游戏章挂 games-body，文字章挂 prose-body → scrollTo(0,0) → h1.focus()
  → 空闲 1s：prefetchDoc('ch04'), prefetchDoc('ch06')
```

### 10.4 打开/关闭弹层

```
点击卡片 → onOpenGame('01')
  → router.navigate({ name:'doc', docId:'ch05', gameId:'01' })  // push
  → 文档已就绪 → selectDocView.game
  → dialog.open(game) → showModal() → 焦点到关闭按钮
关闭 → dialog.close() → router.navigate({ ..., gameId:null }, { replace:true })
  → 焦点回原卡片（记录触发元素）；深链进入则焦点回网格标题
```

### 10.5 上一页 / 下一页

```
click → selectNeighbors(toc, 'ch05') = { prev: ch04, next: ch06 }
  → navigate(#/ch/6)  // push
  → 命中缓存：立即渲染；未命中：骨架 + 请求
  → 4→5、12→13、18→19、21→附录A 连续；前置无上一页，附录F 无下一页
```

### 10.6 失败与重试

```
getDoc 失败 → AppError
  → docs['ch05'] = { status:'error', error }
  → 渲染错误块：文案 + 重试按钮
  → 重试 → retryDoc('ch05') → getDoc('ch05')
toc 失败 → 目录页错误块 + 重试；不渲染空目录
图片 404 → onerror 换成同尺寸色块，卡片布局不塌
清单存储不可用 → 勾选在当前会话内有效，刷新后丢失，不阻断阅读
```

---

## 11. 响应式与可访问性

| 断点 | 目录 | 游戏章 | 文字章 |
|---|---|---|---|
| `<640px` | 单列，搜索框全宽 | 单列卡片，工具栏三按钮等分，弹层全屏 | 单列正文，小节导航折叠为 `<details>`，宽表横向滚动 |
| `640-1023px` | 单列，最大宽 720px | 双列，弹层 90vw / 90vh | 正文单列，上限 38em |
| `≥1024px` | 单列，最大宽 820px | 三列，最大宽 1120px，弹层 720px | 正文 + 260px 吸顶小节导航 |

可访问性：

- 语义结构：`header` / `main` / `nav` / `h1`，skip link 首元素。
- 路由切换后焦点移动到新页 `h1`（`tabindex="-1"`），并更新 `document.title`。
- 弹层用原生 `<dialog>`，自带焦点圈定与 Esc；关闭后焦点回到触发元素。
- 搜索输入 `type="search"` + `aria-label`；结果计数用 `aria-live="polite"`；结果类型标签同时出现在可访问名称里。
- 卡片拆为图片按钮与详情按钮，均可 Enter/Space；图片 `alt`：卡片内为空（按钮名称已含游戏名），弹层为“{游戏名}主图 / 步骤图 N”。
- 图片大图用第二个原生 `<dialog>` 叠层，支持滚轮/双指缩放、拖拽平移、`+/-/0` 与左右键；Esc 只关闭顶层，焦点回到被点击图片。
- 小节导航是 `<nav aria-label="本页目录">`，项为按钮；移动端 `<details>` 的 summary 可键盘展开。
- 表格容器 `role="region"` + `tabindex="0"` + 最近标题作为 `aria-label`；表头 `th scope="col"`；首列 `position:sticky`。
- 清单为原生复选框，`<label>` 包裹文本；清单块带项数说明。
- 对比度 ≥ 4.5:1；焦点环不可移除；`prefers-reduced-motion` 关闭过渡与平滑滚动。
- 键盘：目录页 `Tab` 顺序自然；文档页 `←/→` 切页（输入框、下拉、复选框内不拦截），`Esc` 关弹层。

---

## 12. 性能预算

| 指标 | 预算 |
|---|---|
| `toc.json` / 单文档 JSON / 运行期 JS（未压缩） | 阈值定义在 `tools/budgets.mjs`。`npm run check` 与 `npm test` 直接读它，本节不重抄数字 |
| 首屏请求数 | 1 HTML + 3 CSS + 1 JS 入口（模块并行）+ 1 toc.json |
| 首屏可交互 | 本地 < 1s；4G < 2.5s |
| 切页（缓存命中） | < 50ms |
| 切页（未命中） | 骨架 < 100ms 出现；内容随网络 |
| CLS | < 0.02（游戏卡片固定比例；正文无异步插入） |
| 长文档 | 单文档 ≤ 45 KB；表格横向滚动不撑破页面 |

手段：文档 JSON 按文档拆分；图片懒加载；相邻页预取；文档缓存常驻；卡片列表不做虚拟滚动（单章游戏数受 `tools/budgets.mjs` 的 `MAX_GAMES_PER_CHAPTER` 约束）；正文一次成型，不逐步插入。

---

## 13. 质量保障

### 13.1 自动化

| 检查 | 方式 |
|---|---|
| 数据完整性 | `node tools/check-games.mjs`：28 个文档、130 条游戏、块结构、分组覆盖、资源存在、孤儿文件、体积预算 |
| 提取器 | `tests/data-pipeline.test.mjs`：8 份稿件、伪标题升级、37 项清单、17 张附录表、跨块编号、童谣换行、产物对账 |
| 路由解析 | `node --test`：前置/章节/游戏/附录、补零、越界、非法字母 |
| selector | 搜索大小写、空白、无结果、类型标签、相邻页边界（front/ch01/4→5/12→13/18→19/21→附录） |
| 清单 | 编码解码、越界键过滤、键格式、切换 |
| zoom | 比例边界、指针锚点缩放、连续缩放、平移范围限制、1 倍判定容差 |
| repository | 假 fetch：成功、404、坏 JSON、并发去重、失败不缓存、预取 |
| 发布预算 | `tests/release.test.mjs`：目录与单文档体积、相对路径、`innerHTML` |
| 编码规范 | `tests/standards.test.mjs`：十六进制颜色只在 `tokens.css`、每个 `<img>` 声明 `decoding` |

### 13.2 手动验收

- [ ] 360px / 768px / 1440px 三档无横向滚动；宽表在容器内横向滚动，首列保持可见
- [ ] 首屏 Network 只有 `toc.json`，无文档 JSON；目录 28 行、6 个分组
- [ ] 进入第 5 章后才出现 `ch05.json`；1s 后出现 `ch04/ch06`（预取）
- [ ] 目录 → 文档 → 目录，两次点击内完成
- [ ] 第 4 章“下一页”进入第 5 章；第 12 章进入第 13 章；第 18 章进入第 19 章；第 21 章进入附录 A
- [ ] 前置“上一页”禁用；附录 F“下一页”禁用
- [ ] 搜索“躲猫猫”命中游戏并直达弹层；“里程碑”命中附录 A；无结果有清除按钮
- [ ] 深链 `#/ch/10/game/76` 刷新后仍打开正确弹层
- [ ] 后退关闭弹层，再后退回到上一文档
- [ ] 关闭弹层后焦点回到原卡片
- [ ] 断网后进入未缓存文档显示错误块与重试按钮，恢复网络后重试成功
- [ ] 文字章标题、表格、清单、引用与稿件一致；附录 B 37 项可勾选
- [ ] 勾选后刷新仍保留；“重置本页勾选”清空并取消全部勾选
- [ ] 小节导航点击滚动到对应标题，URL 不变；移动端点击后自动收起
- [ ] 表格容器可 Tab 聚焦；清单可用键盘空格勾选

---

## 14. 关键架构决策与权衡

| 决策 | 备选 | 选型理由 | 代价 | 重估触发 |
|---|---|---|---|---|
| 原生 SPA + 无框架 | React/Vue、MPA | 2 类页面、5 类状态，框架收益低；链路透明、零依赖 | 显式 DOM 更新；无生态 | 模块 > 50、需 SSR、多人并行 |
| hash 路由 | History API、多 HTML | 静态托管零配置；深链可用；无需 404 重写 | URL 含 `#`；SEO 弱 | 需要搜索引擎收录 |
| 一文档一 JSON | 单文件全量、按游戏拆分 | 首屏只请求目录；文档缓存粒度合适 | 跨文档搜索依赖索引 | 文档数 > 100 或内容 > 1 MB |
| 目录内嵌游戏名索引 | 独立 `search.json`、全量加载 | 少一次请求；约 19 KB | TOC 随内容增长 | 索引 > 100 KB |
| 统一“文档”模型 | 保留 chapters/parts | 前置与附录没有章号，统一后分组和相邻页只有一套顺序 | 目录数据要维护 28 条 | 文档模型需要树形层级 |
| 文字章块契约 | 浏览器内解析 Markdown | 运行期零依赖；块结构可校验；表格/清单可控 | 改稿需重跑脚本 | 需要在线编辑内容 |
| 详情用 `<dialog>` | 独立详情页 | 保留滚动与上下文；少一次数据加载 | 分享仍是深链，可接受 | 需要独立 SEO 页 |
| DOM 函数组件 | 模板字符串、Web Components | `textContent` 天然防注入；组合直观 | 无响应式绑定 | 组件状态变复杂 |
| Repository 接口 | 页面直接 fetch | 后端可替换；可注入假 fetch 测试 | 多一层约 30 行 | 接口形态稳定后可简化 |
| 空闲预取相邻页 | 严格按需 | 翻页接近即时 | 每次多看 1-2 个请求 | 流量敏感场景可关闭 |
| 清单存本地 | 账号同步、后端存储 | 无后端；隐私成本最低；实现最小 | 换设备不同步 | 需要账号体系 |
| 不打包 | Vite/Rollup | 26 个模块、HTTP/2 足够；零构建 | 无压缩与 HMR | 引入依赖或 TS |

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

约束由 code review 保证；模块数继续增长时可加 `tools/check-imports.mjs` 做静态扫描，把规则变成 CI 检查。

---

## 16. 里程碑与验收

| 里程碑 | 范围 | 验收 |
|---|---|---|
| M1 数据层 | 8 份稿件解析、块契约、伪标题升级、28 个文档、校验器、插画 | 28 文档 / 130 游戏 0 错误；附录 B 37 项清单、D/E 编号连续；`node --test` 通过 |
| M2 应用壳 + 目录 | `index.html`、router、store、repository、目录页 | `#/` 只加载 toc；28 行 6 组；搜索命中游戏与文档 |
| M3 文档页 + 导航 | 文档页外壳、游戏章正文、相邻页、预取、骨架 | 三档断点；4→5、12→13、21→附录 A；切页回顶；缓存命中 < 50ms |
| M4 文字章 + 打磨 | 块渲染、表格、清单、小节导航、深链、焦点、错误态 | 手动验收全过；宽表不撑破页面；清单可持久化与重置 |

每个里程碑结束产出可运行版本，验收通过再进入下一段。M1 不依赖任何 UI，可先独立完成并校验数据。

---

## 17. 风险

| 风险 | 影响 | 应对 |
|---|---|---|
| 稿件格式变化 | 提取失败 | 校验器定位到文档 id + 行号/块号；JSON 契约隔离浏览器代码 |
| 长文块渲染退化 | 阅读体验差 | 块契约 + 统一渲染器 + 数据基线测试 |
| 宽表撑破移动端 | 横向滚动 | 表格容器 `overflow-x:auto` + 首列 sticky；手动 360px 验收 |
| 清单状态损坏 | 页面异常 | 编码解码容错 + 越界键过滤 + 存储失败静默降级 |
| 水彩 JPG 体积或缺失 | 图文错位 | 构建期检查存在性；`onerror` 色块兜底；固定宽高比 |
| 预取被误解为加载多章 | 需求争议 | 预取只暖缓存、不渲染；可一行关闭 |
| 无框架导致页面耦合 | 维护成本上升 | 依赖矩阵 + 页面对象契约 + review |
| 静态托管缓存旧 JSON | 内容不更新 | 短缓存或 `bookVersion` 查询参数 |
| hash 链接在聊天工具被截断 | 分享失效 | 后续提供“复制链接”按钮 |

---

## 18. 当前状态与后续

v0.2 已完成：28 个文档、130 个游戏、前置与附录、文字章块渲染、宽表、清单、小节导航、搜索扩展、相邻页与预取。

后续候选（不在 v0.2 范围）：

1. 记录页（附录 F）打印样式与“复制链接”。
2. 搜索建议与最近浏览。
3. 图片懒加载占位图与渐进式加载。
4. 若文档数超过 100 或需要账号同步，再评估分页、后端与鉴权。
