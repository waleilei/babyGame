import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadAssetKeys, loadGameIndex, loadPromptDir, validatePrompts } from './prompt-catalog.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const { presets, entries, errors: parseErrors } = loadPromptDir(ROOT);
const games = loadGameIndex(ROOT);
const assetKeys = loadAssetKeys(ROOT);
const { errors, warnings, status } = validatePrompts({ entries, presets, games, assetKeys });

const allErrors = [...parseErrors, ...errors];

for (const warning of warnings) console.warn(`警告：${warning}`);
for (const error of allErrors) console.error(`错误：${error}`);

console.log(
  `提示词：${status.total} 条，已复核 ${status.reviewed}，待复核 ${status.draft}；错误 ${allErrors.length}，警告 ${warnings.length}`,
);

if (allErrors.length) process.exit(1);
