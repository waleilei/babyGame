# babyGame v0.1 设计方案（已归档）

> 状态：已被 `docs/architecture.md` 取代 ｜ 版本：0.1 ｜ 日期：2026-10-20
> 归档原因：新增“一章一页、目录/相邻章导航、按章加载”三项需求，数据与路由结构变更。
> 本文仅保留早期推演过程，落地以 `docs/architecture.md` 为准。
> 数据来源：`../books/0-3-game-book`（《0-3岁亲子游戏图鉴》，130 个游戏）
> 技术前提：纯静态、无框架、无打包器，浏览器直接运行

---

## 1. 目标与非目标

### 1.1 目标

把书稿变成可查、可筛、可深链的网页游戏库，第一版只回答一个问题：

> 我的宝宝现在这个月龄，今天能玩什么？

具体能力：

1. 浏览 130 个游戏卡片（主图 + 编号 + 名称 + 月龄 + 能力 + 时长）
2. 按阶段（0-3月 … 31-36月 / 生活场景）、按能力（六大能力）筛选
3. 关键词搜索（名称、玩法、材料、场地）
4. 打开单个游戏，完整看到书里的 8 个模块
5. 每个游戏有独立链接，可分享、可刷新、可后退

### 1.2 非目标（v0.1 不做）

| 不做 | 原因 |
|---|---|
| 账号、云同步、游戏记录 | 需要后端，超出「最小可用」 |
| 收藏、打卡、提醒 | 依赖本地存储设计，放到 v0.2 |
| 拼音搜索、全文分词 | 130 条规模用子串匹配已够 |
| PWA / 离线缓存 | 先把数据与界面跑通 |
| 插画生成、稿件编辑 | 上游是 `0-3-game-book`，本项目管理只读副本 |
| 多语言 | 内容为中文，字体栈按中文优化 |

### 1.3 成功标准

- `node tools/extract-games.mjs` 一条命令产出 130 条合法数据，0 错误
- `python3 -m http.server` 后，首屏 1 秒内出现卡片
- 筛选、搜索、详情、后退四条链路手动走通
- 断网（本地服务仍在）时不出现白屏，有可读错误提示

---

## 2. 约束与前提

| 约束 | 说明 |
|---|---|
| 数据规模 | 130 条游戏，约 80 KB JSON；650 个 SVG，共约 4.2 MB |
| 浏览器 | 近两年 Chrome / Safari / Firefox / Edge，支持 `<dialog>`、ES2022 |
| 构建 | 无 npm 依赖；Node ≥ 18 仅用于提取与校验 |
| 运行 | 必须经 HTTP 访问（`fetch` + ES module 在 `file://` 下被浏览器拦截） |
| 视觉 | 复用样章色板与排版气质，见第 8 节 |
| 数据方向 | 单向：Markdown → JSON → 界面；页面不回写稿件 |

---

## 3. 总体架构

两层，构建期与运行期彻底分离：

```
┌────────────────────────── 构建期（Node，手动执行） ──────────────────────────┐
│                                                                              │
│  manuscript/*.md  ──►  tools/extract-games.mjs  ──►  data/games.json         │
│  （ch05-08 / ch09-12 /     解析 → 归一化 → 校验        data/meta.json         │
│    ch13-18，共 130 条）                              assets/ill/**            │
│                              │                                               │
│                              └──► tools/check-games.mjs（独立复检，退出码）   │
└──────────────────────────────────┬───────────────────────────────────────────┘
                                   │ 静态文件（HTTP）
┌──────────────────────────────────▼───────────────────────────────────────────┐
│                          运行期（浏览器，无框架）                              │
│                                                                              │
│  index.html ──► src/app.js ──► src/data.js   fetch + 索引                     │
│                     │              │                                          │
│                     │              ▼                                          │
│                     │         src/state.js   筛选条件、派生可见列表（纯函数）  │
│                     │              │                                          │
│                     └──────► src/render.js   卡片 / 筛选条 / 详情 dialog      │
│                                    │                                          │
│                                    ▼                                          │
│                                  DOM + CSS                                    │
└──────────────────────────────────────────────────────────────────────────────┘
```

**关键决策**

1. **构建期解析，运行期只读 JSON**：页面不解析 Markdown，稿件格式变化不会波及浏览器代码。
2. **JSON 是唯一契约**：界面只认 `games.json` / `meta.json` 的字段，不认稿件里的 `**玩**：` 写法。
3. **无框架**：130 条数据、4 个视图状态，原生 JS 足够；同时让你看清「数据 → 状态 → DOM」的完整链路，而不是被框架语法挡住。
4. **筛选在客户端完成**：数据一次加载，之后纯内存计算，切换无网络请求。
5. **插画复制而非软链**：项目可独立部署，不依赖书籍仓库路径。

---

## 4. 目录结构

```
babyGame/
├── index.html                  # 唯一页面，含 4 个挂载点
├── styles/
│   └── app.css                 # 设计令牌 + 布局 + 组件样式
├── src/
│   ├── app.js                  # 启动、事件绑定、编排
│   ├── data.js                 # 加载 JSON、建索引、字段兜底
│   ├── state.js                # 筛选状态与派生计算（纯函数）
│   └── render.js               # 所有 DOM 生成与更新
├── data/
│   ├── games.json              # 130 条游戏（产物，不手改）
│   └── meta.json               # 阶段/能力/章节统计（产物）
├── assets/
│   ├── ill/001.svg … 130.svg   # 主图（820×640）
│   ├── ill/panel/001-1.svg …   # 步骤图（400×300，每游戏 4 张）
│   └── course.css              # 教学文档共用样式（不属于 app）
├── tools/
│   ├── extract-games.mjs       # 稿件 → JSON + 复制插画
│   └── check-games.mjs         # 只读 JSON 与资源，独立校验
├── docs/
│   └── design.md               # 本文档
├── lessons/                    # 教学课程（HTML）
├── reference/                  # 速查表（HTML）
├── MISSION.md / NOTES.md / RESOURCES.md
└── learning-records/
```

---

## 5. 数据层设计

### 5.1 数据源与解析规则

只读取三个文件，合计 130 条：

| 文件 | 条数 | 说明 |
|---|---|---|
| `manuscript/ch05-08.md` | 48 | 第 5-8 章，0-12 月，编号 01-48 |
| `manuscript/ch09-12.md` | 52 | 第 9-12 章，13-36 月，编号 49-100 |
| `manuscript/ch13-18.md` | 30 | 第 13-18 章，生活场景，编号 101-130 |

单条游戏在稿件中的固定形态：

```md
### 01 黑白卡追视
`0-3月 · 认知探索 · 3-5分钟 · 床/地垫 · 黑白卡3-5张 · 1对1`

**玩**：把卡片放进宝宝的清晰视距，再慢慢移开，让眼睛追着走。
**步骤**：①…②…③…④…
**观察**：眼球会跟着卡片移动；跟丢后能重新找回；出现短暂屏息或四肢兴奋。
**进阶**：换成红黑卡或人脸图案。 **降阶**：只做静止注视，不移动。
**安全**：卡片不反光……
**问**：宝宝不看怎么办？……
```

解析规则：

| 目标 | 规则 |
|---|---|
| 标题 | `^### (\d{2,3}) (.+)$`，编号即 `id` |
| 信息条 | 紧随标题的反引号行，按 `·` 切成 6 段：月龄 / 主能力 / 时长 / 场地 / 材料 / 人数 |
| 字段 | 行首 `**玩|步骤|观察|进阶|降阶|安全|问**：` |
| 步骤 | 按 `①②③④` 切分，去掉空段 |
| 观察 | 按 `；` 切分，去掉空段 |
| 进阶/降阶 | 同一行两个字段，用全局正则切分 |
| 章节 | `## 第N章 …`，`part` 来自 `# 第X篇 …` |
| 阶段 | `partNo === 2` 用该章首条游戏的月龄；`partNo === 3` 统一记为「生活场景」 |

### 5.2 数据契约：`Game`

```jsonc
{
  "id": "01",                     // 字符串，两位或三位，01-130，唯一
  "name": "黑白卡追视",            // 4-8 字
  "part": "分月龄游戏图鉴",         // 篇名
  "partNo": 2,                    // 1-4
  "chapterNo": 5,                 // 章号
  "chapterTitle": "0-3个月｜躺着的世界",
  "track": "月龄",                 // "月龄" | "场景"
  "stage": "0-3月",               // 筛选用阶段键，见 meta.stages
  "age": "0-3月",                 // 原样保留
  "ageRange": { "min": 0, "max": 3 },  // 数值区间，供「适合月龄」计算
  "ability": "认知探索",           // 六大能力之一
  "duration": "3-5分钟",
  "place": "床/地垫",
  "materials": "黑白卡3-5张",
  "people": "1对1",
  "play": "把卡片放进宝宝的清晰视距，再慢慢移开，让眼睛追着走。",
  "steps": ["宝宝清醒平静时仰卧，卡片距脸25-30厘米。", "…"],
  "observe": ["眼球会跟着卡片移动", "…"],
  "up": "换成红黑卡或人脸图案。",
  "down": "只做静止注视，不移动。",
  "safety": "卡片不反光……",
  "question": "宝宝不看怎么办？……",
  "art": {
    "main": "assets/ill/001.svg",
    "panels": ["assets/ill/panel/001-1.svg", "…-2", "…-3", "…-4"]
  }
}
```

字段级别约定：

- `steps` 长度 4（稿件标准）；`observe` 长度 2-3
- 所有字符串做 `trim`，不截断原文、不二次改写
- `ageRange` 非必填兜底：无法解析时省略该字段，界面按 `age` 原样展示
- `art` 路径为项目内相对路径，统一以 `assets/` 开头

### 5.3 数据契约：`meta.json`

```jsonc
{
  "book": {
    "title": "0-3岁亲子游戏图鉴",
    "subtitle": "130个游戏，把日常变成早教",
    "version": "v1.4",
    "updatedAt": "2026-10-19"
  },
  "total": 130,
  "stages": [
    { "key": "0-3月", "label": "0-3月", "track": "月龄", "count": 10 },
    { "key": "4-6月", "label": "4-6月", "track": "月龄", "count": 12 },
    { "key": "生活场景", "label": "生活场景", "track": "场景", "count": 30 }
  ],
  "abilities": [
    { "key": "大运动", "count": 21 },
    { "key": "精细动作", "count": 24 }
  ],
  "chapters": [
    { "no": 5, "title": "0-3个月｜躺着的世界", "partNo": 2, "count": 10, "firstId": "01" }
  ]
}
```

阶段顺序固定为：0-3月、4-6月、7-9月、10-12月、13-18月、19-24月、25-30月、31-36月、生活场景。
能力顺序固定为：大运动、精细动作、语言沟通、认知探索、社会情绪、生活自理。

### 5.4 校验规则

`extract-games.mjs` 写出前自检，`check-games.mjs` 独立复检，二者共用同一组规则：

| 级别 | 规则 | 处理 |
|---|---|---|
| error | 总数不是 130 | 不写文件，退出 1 |
| error | id 重复 / 不在 01-130 | 不写文件 |
| error | 缺少 8 模块中任一必填项 | 不写文件 |
| error | 信息条不足 6 段 | 不写文件 |
| error | `ability` 不在六大能力内 | 不写文件 |
| error | 主图或任一步骤图不存在 | 不写文件 |
| error | `steps` 或 `observe` 为空 | 不写文件 |
| warning | 步骤 ≠ 4 条、观察不在 2-3 条 | 写出，终端提示 |
| warning | 与大纲索引表（编号/名称/月龄/能力）不一致 | 写出，提示逐条差异 |

退出码：`0` 通过；`1` 数据错误；`2` 输入目录或文件缺失。

---

## 6. 运行时模块划分

### 6.1 职责

| 模块 | 职责 | 不负责 |
|---|---|---|
| `src/data.js` | `fetch` 两个 JSON、建 `Map` 索引、字段兜底 | 不做筛选、不碰 DOM |
| `src/state.js` | 初始状态、筛选更新、派生可见列表、计数 | 不读文件、不碰 DOM |
| `src/render.js` | 生成卡片/筛选条/详情/空态，切换 `aria-pressed` | 不持有业务状态 |
| `src/app.js` | 启动、事件委托、编排 render、hash 路由 | 不写渲染细节 |
| `styles/app.css` | 令牌、布局、卡片、dialog、响应式 | 不含 JS |

### 6.2 JS 接口

```js
// data.js
export async function loadCatalog(base = 'data') : Promise<Catalog>
// Catalog = { games: Game[], meta: Meta, byId: Map<string, Game> }

// state.js
export function createState(catalog) : State
// State = { catalog, filters: { stage, ability, query }, selectedId }

export function setFilters(state, patch) : State      // 返回新对象，不修改入参
export function visibleGames(state) : Game[]          // 派生，不缓存
export function stageChips(state) : Chip[]            // { key, label, count, active }
export function abilityChips(state) : Chip[]
export function countLabel(state) : string            // "130 个游戏" / "找到 12 个"

// render.js
export function renderFilters(root, chips, handlers) : void
export function renderGrid(root, games, { onOpen }) : void
export function renderDetail(dialog, game, { onClose }) : void
export function renderEmpty(root, { query, onReset }) : void
export function setActiveChip(root, group, key) : void

// app.js
export async function bootstrap() : Promise<void>
```

约束：

- `state.js` 全部为纯函数，输入输出可预测，便于手动测试
- `render.js` 只接收数据与回调，不 import `state.js`
- 事件通过容器委托，不在每次渲染时重新绑定

### 6.3 DOM 契约

| 挂载点 | 内容 |
|---|---|
| `#app-header` | 标题、副标题、结果计数 |
| `#filters` | 阶段 chips、能力 chips、搜索框、清除按钮 |
| `#grid` | `<ul>` + `<li><button class="card" data-game-id="01">` |
| `#empty` | 无结果提示 + 清除筛选 |
| `#error` | 加载失败提示 + 启动命令 |
| `#detail` | `<dialog>`，含主图、8 模块、步骤图、关闭按钮 |

数据属性约定：`data-stage`、`data-ability`、`data-game-id`、`data-action="reset|close"`。
`aria-pressed` 表示 chip 选中；`aria-live="polite"` 播报结果数。

---

## 7. 数据流与关键流程

### 7.1 构建期：提取

```
读取 3 个 md
  → 逐行状态机（篇 → 章 → 游戏 → 字段）
  → 归一化（切分信息条/步骤/观察，补 art 路径）
  → 校验（结构、枚举、资源存在、计数）
  → 写 data/games.json、data/meta.json
  → 复制 assets/ill（130 主图 + 520 步骤图）
  → 打印统计，退出码 0/1
```

### 7.2 首屏加载

```
DOMContentLoaded
  → loadCatalog(): fetch games.json + meta.json（并行）
  → 建 byId、按 id 排序、补默认 stage
  → createState()
  → renderHeader / renderFilters / renderGrid
  → 读取 location.hash，若为 #/game/01 则打开详情
```

失败分支：任一 `fetch` 非 2xx 或 JSON 解析失败 → 隐藏 `#grid`，显示 `#error`，提示用 HTTP 启动。

### 7.3 筛选与搜索

```
用户点击 chip / 输入关键词
  → 事件委托捕获
  → setFilters(state, patch)   // 纯函数，返回新 state
  → visibleGames(state)        // 阶段 AND 能力 AND 关键词
  → renderGrid + 更新计数 + 更新 aria-pressed
  → 若结果为空，显示 #empty
```

匹配规则：`query` 去首尾空格、转小写，对 `name / play / materials / place` 做子串匹配；空串视为不过滤。
不做防抖：130 条数据单次计算 < 1 ms。

### 7.4 详情与深链

```
点击卡片
  → location.hash = `#/game/${id}`
  → hashchange → renderDetail(dialog, game)
  → dialog.showModal()，焦点进入关闭按钮

关闭（按钮 / Esc / 点击遮罩）
  → dialog.close()
  → history.replaceState 清除 hash（不新增历史项）
```

直接访问 `index.html#/game/042` 时，加载完成后直接打开详情；id 不存在则清除 hash 并回列表。

### 7.5 边界与降级

| 场景 | 行为 |
|---|---|
| `fetch` 失败 | `#error` 可读提示，附带 `python3 -m http.server 5173` |
| 主图 404 | `<img onerror>` 换成同尺寸色块，不破坏卡片高度 |
| 搜索无结果 | 空态文案 + 「清除筛选」按钮 |
| 无 JS | `<noscript>` 说明需要启用 JavaScript |
| 窄屏（<640px） | 卡片单列，筛选条横向滚动，详情全屏 |

---

## 8. 视觉与交互规范（摘要）

| 令牌 | 值 | 用途 |
|---|---|---|
| `--paper` | `#FBF8F2` | 页面与卡片底 |
| `--ink` | `#2E2A26` | 正文 |
| `--muted` | `#7A7268` | 次要信息 |
| `--wood` | `#D9C3A5` | 分隔、装饰 |
| `--blue` | `#A8C0CC` | 能力标签 |
| `--red` | `#B5543F` | 安全提示、强调 |
| `--line` | `#E3DACB` | 边框 |

- 标题：`"Noto Serif SC", "Source Han Serif SC", serif`，正文与 UI：`system-ui, "PingFang SC", sans-serif`
- 卡片：主图 820:640、圆角 4px、1px 描边、hover 轻微上移；编号用等宽数字
- 详情：桌面居中 720px，移动端全屏；步骤用 ①②③④ 编号；安全块用左侧红色竖线
- 动效只用于 hover 与 dialog 出现，遵守 `prefers-reduced-motion`

---

## 9. 预期输出格式

### 9.1 提取命令输出

```
$ node tools/extract-games.mjs
源目录  /home/wall/vibe/books/0-3-game-book
读取    3 个文件
解析    130 条游戏（月龄 100 / 场景 30）
校验    0 error / 0 warning
写出    data/games.json   82 KB
        data/meta.json     1.8 KB
插画    130 主图 + 520 步骤图 → assets/ill
耗时    0.42s
```

失败示例：

```
$ node tools/extract-games.mjs
✗ 042 双手传递  缺少「安全」
✗ 101 换尿布飞机操  步骤 3 条（期望 4）
2 个错误，未写出文件
```

### 9.2 页面状态

| 状态 | 呈现 |
|---|---|
| 初始 | 130 张卡片，计数「130 个游戏」 |
| 筛选后 | 计数「找到 N 个」，阶段/能力 chip 高亮 |
| 搜索无结果 | 「没有匹配的游戏」+ 清除按钮 |
| 详情打开 | dialog 显示主图、8 模块、4 张步骤图 |
| 加载失败 | 「数据加载失败」+ 启动命令 |

### 9.3 URL 规则

| URL | 含义 |
|---|---|
| `index.html` | 全部游戏 |
| `index.html#/game/01` | 打开 01 号游戏详情 |
| 不存在的 id | 清除 hash，回到列表 |

v0.1 不把筛选条件写入 URL；v0.2 再考虑 `?stage=&ability=&q=`。

---

## 10. 质量与验收

### 10.1 功能验收清单

- [ ] `node tools/extract-games.mjs` 产出 130 条，退出码 0
- [ ] `node tools/check-games.mjs` 独立复检通过
- [ ] 卡片数量与 `meta.total` 一致
- [ ] 9 个阶段 chip、6 个能力 chip，计数之和分别为 130
- [ ] 阶段 + 能力 + 关键词三者可叠加
- [ ] 详情 8 个模块齐全，步骤图 4 张
- [ ] 深链 `#/game/100` 可直接打开
- [ ] 后退/关闭后列表滚动位置不跳变
- [ ] 键盘 Tab 可达所有卡片，Esc 可关闭详情
- [ ] 360px 宽度下无横向滚动

### 10.2 非功能指标

| 项 | 目标 |
|---|---|
| 首屏 | 本地 < 1s；4G < 3s（不含图片全量） |
| 数据体积 | `games.json` < 120 KB |
| 单次筛选 | < 16 ms（一帧内） |
| 可访问性 | 语义标签、焦点可见、对比度 ≥ 4.5:1 |
| 兼容性 | Chrome/Edge 110+、Safari 16+、Firefox 110+ |

---

## 11. 里程碑与教学映射

| 里程碑 | 产出 | 验收 | 对应课程 |
|---|---|---|---|
| M0 设计评审 | 本文档 | 你确认字段、流程、范围 | — |
| M1 数据层 | `extract-games.mjs`、`check-games.mjs`、JSON、插画 | 130 条 0 错误，能说出每个字段来自稿件哪里 | 第 1 课：数据与视图分离 |
| M2 只读列表 | `index.html`、`app.css`、`data.js`、`render.js` 的卡片部分 | 130 张卡片正确显示 | 第 2 课：fetch 与渲染 |
| M3 筛选与详情 | `state.js`、筛选条、搜索、dialog | 三条筛选链路可用 | 第 3 课：状态与派生 |
| M4 打磨 | 深链、空态、错误态、响应式、a11y | 验收清单全过 | 第 4 课：边界与可访问性 |

---

## 12. 风险与待定项

| 风险 | 影响 | 应对 |
|---|---|---|
| 稿件格式微调 | 解析器失效 | 解析失败给出行号与编号；JSON 是稳定契约 |
| 插画体积增长 | 首屏变慢 | 卡片图 `loading="lazy"`；必要时转 WebP |
| 无框架导致代码膨胀 | 维护困难 | 模块边界固定；超过 500 条或出现多页面再评估框架 |
| 中文搜索无拼音 | 找不到「hei bai ka」 | v0.2 引入拼音表，v0.1 明确不支持 |
| 手机端详情过长 | 阅读疲劳 | 折叠「进阶/降阶/安全」，步骤图横向滑动 |

### 待你确认的 4 个问题

1. v0.1 只要「浏览 + 筛选 + 详情」，还是要把「收藏」一起做掉？
2. 详情用 `#/game/01` 深链是否接受（会影响后面部署与分享方式）？
3. 部署目标是本地看、GitHub Pages，还是 CloudBase 等国内静态托管？
4. 卡片主图用书籍插画，还是先用编号色块占位、后接插画？

确认后我按 M1 → M4 推进；每个里程碑结束都可运行、可验收，再进入下一段。
