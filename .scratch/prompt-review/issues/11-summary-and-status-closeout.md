# 11: 汇总与状态收口

**What to build:** 汇总 10 章的复核结果，确认 520 条全部为「已复核」，并把迁移报告里的状态数字同步。报告要写明本轮是「由模型复核」，不冒充人工确认。

**Blocked by:** 02, 03, 04, 05, 06, 07, 08, 09, 10

**Status:** ready-for-human

- [x] 520 条状态全部为「已复核」，无「待复核」残留
- [x] `reports/prompt-review.md` 有总览：各章问题数、修改数、存疑条目总数
- [x] 报告首段写明「由模型复核」，并列出五项核对标准
- [x] `reports/prompt-migration.md` 的状态数字同步为 520 已复核
- [x] `npm run check` 与 `npm test` 全绿
