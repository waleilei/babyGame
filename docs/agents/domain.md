# Domain Docs

工程类技能在探索代码库时，应如何消费本仓库的领域文档。

## 探索之前先读

- 仓库根的 **`GLOSSARY.md`**，或
- 若存在仓库根的 **`GLOSSARY-MAP.md`**：它指向每个上下文各自的 `GLOSSARY.md`。读取与当前主题相关的每一个。
- **`docs/adr/`**：读取涉及你即将改动的领域的 ADR。多上下文仓库还要检查 `src/<context>/docs/adr/` 中上下文级别的决策。

这些文件若不存在，**静默继续**。不要提示缺失，也不要主动建议先创建它们。`/domain-modeling` 技能（经 `/grill-with-docs` 与 `/improve-codebase-architecture` 触达）会在术语或决策真正落定时按需创建。

## 文件结构

本仓库为单上下文（single-context）：

```
/
├── GLOSSARY.md
├── docs/adr/
│   ├── 0001-event-sourced-orders.md
│   └── 0002-postgres-for-write-model.md
└── src/
```

若将来出现 `GLOSSARY-MAP.md`，则转为多上下文：根 `docs/adr/` 放系统级决策，`src/<context>/GLOSSARY.md` 与 `src/<context>/docs/adr/` 放上下文级决策。

## 使用领域词汇

当输出中出现领域概念（issue 标题、重构提案、假设、测试名）时，使用 `GLOSSARY.md` 中定义的术语。不要漂移到词汇表明确回避的同义词。

若需要的概念尚未收录，这是一个信号：要么你在发明项目不使用的语言（重新考虑措辞），要么确实存在缺口（记下来，交给 `/domain-modeling`）。

## 标出 ADR 冲突

若你的输出与既有 ADR 矛盾，显式指出，不要悄悄覆盖：

> _与 ADR-0007（事件溯源订单）冲突，但值得重开，因为……_
