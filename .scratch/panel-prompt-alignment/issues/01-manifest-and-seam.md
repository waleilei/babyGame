# 01: 清单、备份与校验接缝

**What to build:** 在改动任何一张图之前，先让「这本账」立起来：每张图有一行记录（用了哪版提示词、为什么改、新旧指纹、状态），覆盖前自动备份、可按指纹回滚，并把清单校验接进现有的统一校验入口，使「键、图片、提示词、清单」四者是否自洽由一次校验回答。

**Blocked by:** None（可以立即开始）

**Status:** ready-for-human

- [ ] 清单字段与枚举固定：decision 为 pass/regen；reason 覆盖 P0-pass 与 A1–A6；status 覆盖 audited/regenerated/verified/needs-human/blocked
- [ ] 覆盖图片前自动备份，备份命名保留原 key，回滚后磁盘指纹回到 old_sha256
- [ ] 清单校验并入现有统一校验入口，覆盖 7 类失败：缺行、重复 key、状态越界、prompt_hash 过期、regen 缺指纹、备份缺失、verified 指纹与磁盘不符
- [ ] 未改动图片时，全量校验保持 0 错误 0 警告
- [ ] 用一批假数据跑通「覆盖 → 校验报警 → 回滚 → 校验通过」

## Comments

- 2026-10-20 完成：台账模块（reports/panel-ledger/chNN.csv + 备份区）落地；清单校验并入统一校验入口；备份与回滚可按指纹还原。tests 87/87 通过，npm run check 0 错误 0 警告。待人工过一眼接缝设计。
