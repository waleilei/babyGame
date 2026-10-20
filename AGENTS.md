# babyGame

## 文档地图

- `docs/architecture.md`：当前架构的权威描述（分层、路由、数据契约、性能预算、质量保障）。
- `docs/design.md`：v0.1 设计方案，**已归档**。只作历史依据；与 architecture 冲突时以 architecture 为准。
- `docs/release.md`：发布门禁、验收清单与部署方式。
- `prompts/README.md`：520 条步骤图提示词的目录结构、分层模型、拼接顺序与校验方式。

## Agent skills

### Issue tracker

Issue 与 spec 以本地 markdown 文件存放在 `.scratch/` 下。详见 `docs/agents/issue-tracker.md`。

### Domain docs

单上下文：仓库根 `GLOSSARY.md` + `docs/adr/`。详见 `docs/agents/domain.md`。

### Review

两轴评审纪律见 `docs/agents/review.md`。
