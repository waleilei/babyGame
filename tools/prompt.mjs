import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { composePrompt, loadPromptDir } from './prompt-catalog.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = String(process.argv[2] ?? '').trim();

if (!arg) {
  console.error('用法：npm run prompt <编号>');
  console.error('  单个步骤图：npm run prompt 006-3');
  console.error('  一个游戏：  npm run prompt 006');
  process.exit(1);
}

const { presets, entries, errors } = loadPromptDir(ROOT);
if (errors.length) {
  for (const error of errors) console.error(error);
  process.exit(1);
}

const isPanel = /^\d{3}-\d$/.test(arg);
const isGame = /^\d{3}$/.test(arg);
if (!isPanel && !isGame) {
  console.error(`编号「${arg}」不合法：应为 006 或 006-3`);
  process.exit(1);
}

const targets = entries.filter((entry) => (isPanel ? entry.key === arg : entry.gameId === arg));
if (!targets.length) {
  console.error(`没有找到「${arg}」的提示词`);
  process.exit(1);
}

for (const entry of targets) {
  const camera = presets.cameras.get(entry.fields['镜头']);
  const scene = presets.scenes.get(entry.fields['场景']);
  console.log(`\n${entry.key}　${entry.gameName}｜步骤图 ${entry.panel}`);
  console.log(composePrompt(entry, presets));
  console.log(
    `镜头 ${camera?.name ?? '?'} · 场景 ${scene?.name ?? '?'} · 月龄 ${entry.fields['月龄']} · 道具 ${entry.fields['道具'] ?? '无'} · 状态 ${entry.fields['状态']}`,
  );
}
