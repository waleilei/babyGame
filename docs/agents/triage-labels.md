# Triage Labels

各技能用五个规范 triage 角色表述状态。本文件把这些角色映射到本仓库实际使用的标签字符串。

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

当技能提到某个角色（例如「打上 AFK-ready 的 triage 标签」）时，使用表中对应的标签字符串。

Issue tracker 是本地 markdown，因此标签不是平台对象，而是写在 issue 文件顶部附近的 `Status:` 行，例如：

```markdown
Status: ready-for-agent
```

修改左侧角色名以外的任何列，都请只改「Label in our tracker」一列以匹配你实际使用的词汇。
