import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { hashText, validateLedgers } from './panel-ledger.mjs';
import { composePrompt, loadAssetKeys, loadGameIndex, loadPromptDir, validatePrompts } from './prompt-catalog.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const { presets, entries, errors: parseErrors } = loadPromptDir(ROOT);
const games = loadGameIndex(ROOT);
const assetKeys = loadAssetKeys(ROOT);
const { errors, warnings, status } = validatePrompts({ entries, presets, games, assetKeys });

/** 台账校验：只校验已登记的章；没登记的章不报错，登记了就按七类失败从严。 */
const chapterKeys = new Map();
for (const entry of entries) {
  const set = chapterKeys.get(entry.chapter) ?? new Set();
  set.add(entry.key);
  chapterKeys.set(entry.chapter, set);
}
const promptHashes = new Map();
for (const entry of entries) {
  const complete = ['镜头', '场景', '月龄', '动作'].every((key) => entry.fields[key]);
  promptHashes.set(entry.key, complete ? hashText(composePrompt(entry, presets)) : '');
}
const ledger = validateLedgers({ root: ROOT, chapterKeys, promptHashes, assetKeys });

const allErrors = [...parseErrors, ...errors, ...ledger.errors];

for (const warning of warnings) console.warn(`警告：${warning}`);
for (const error of allErrors) console.error(`错误：${error}`);

console.log(
  `提示词：${status.total} 条，已复核 ${status.reviewed}，待复核 ${status.draft}；错误 ${allErrors.length}，警告 ${warnings.length}`,
);
if (ledger.status.chapters) {
  console.log(
    `台账：${ledger.status.chapters} 章 / ${ledger.status.rows} 行，pass ${ledger.status.pass}，regen ${ledger.status.regen}，verified ${ledger.status.verified}，needs-human ${ledger.status.needsHuman}，blocked ${ledger.status.blocked}`,
  );
}

if (allErrors.length) process.exit(1);
