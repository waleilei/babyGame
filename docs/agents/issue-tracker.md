# Issue tracker：本地 Markdown

本仓库的 issue 与 spec 以 markdown 文件形式存放在 `.scratch/`。

## 约定（Conventions）

- 一个特性一个目录：`.scratch/<feature-slug>/`
- spec 为 `.scratch/<feature-slug>/spec.md`
- 实现类 issue 一个 ticket 一个文件：`.scratch/<feature-slug>/issues/<NN>-<slug>.md`，从 `01` 起编号，禁止把所有 ticket 合并成一个文件
- triage 状态记录在文件顶部附近的 `Status:` 行（角色字符串见 `triage-labels.md`）
- 评论与对话历史追加到文件末尾的 `## Comments` 标题下

## 当技能说「publish to the issue tracker」

在 `.scratch/<feature-slug>/` 下新建文件（目录不存在则创建）。

## 当技能说「fetch the relevant ticket」

读取对应路径的文件。用户通常会直接给出路径或 issue 编号。

## Wayfinding operations（/wayfinder）

**Map** 是一个文件，每个 ticket 对应一个 **child** 文件。

- **Map**：`.scratch/<effort>/map.md`（Notes / Decisions-so-far / Fog 正文）
- **Child ticket**：`.scratch/<effort>/issues/NN-<slug>.md`，从 `01` 起编号，正文写要回答的问题。`Type:` 行记录类型（`research` / `prototype` / `grilling` / `task`）；`Status:` 行记录 `claimed` / `resolved`
- **Blocking**：顶部附近的 `Blocked by: NN, NN` 行。所列文件全部 `resolved` 才算解除阻塞
- **Frontier**：扫描 `.scratch/<effort>/issues/`，找出开放、无阻塞、未认领的文件；编号最小的优先
- **Claim**：动手前先改成 `Status: claimed` 并保存
- **Resolve**：在 `## Answer` 标题下追加答案，设为 `Status: resolved`，再把上下文指针（要点 + 链接）追加到 `map.md` 的 Decisions-so-far 段
