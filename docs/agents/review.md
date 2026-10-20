# Review Rules

本仓库的 review 分两轴：**Standards**（成文标准 + 机械规则）与 **Spec**（需求覆盖）。两轴分开报告，不合并排序。

## 每次 review 必做

1. 读原始 spec 与 issue。逐条核对 `[x]` 与 diff；勾选框是声明，不是证据。声明与代码不符时以代码为准。
2. 先跑 `npm run check`、`npm test`、`npm run smoke`。工具能判的，不靠人眼；review 只看工具未覆盖的判断。
3. spec 的数字与当前内容不一致时，报告差异。不要静默重定义验收点；说明以哪边为准。
4. issue 要求与 `docs/architecture.md` 的标准冲突时，显式报告冲突，并说明按哪一边执行。
5. 引用具体文件与 hunk。不要写“代码不好”这类没有落点的结论。

## 已有机械门禁

- `tools/check-imports.mjs`：分层依赖、深层路径、非相对导入。
- `tools/check-docs.mjs`：文档路径存在、旧符号不残留。
- `tools/check-games.mjs`：数据、块结构、体积、孤儿文件。
- `tests/*`：路由、选择器、清单、仓储、预算、颜色令牌、`img decoding`。

## 判断项

命名、重复、抽象是否值得、文档与代码是否一致，属于判断项。给 hunk，给标准，给修法。
