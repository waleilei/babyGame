import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { composePrompt, loadPromptDir } from './prompt-catalog.mjs';

/**
 * 步骤图台账：每格一行，记录「用了哪版提示词、为什么改、新旧指纹、状态」。
 *
 * 位置约定（相对仓库根）：
 * - 清单 `reports/panel-ledger/chNN.csv`，一章一份，可 diff；
 * - 备份 `.scratch/panel-prompt-alignment/backup/`，按「key-指纹前 12 位」命名，不可变，只追加；
 * - 图片 `assets/art/panel_web/NNN-K.jpg`。
 */

export const LEDGER_DIR = 'reports/panel-ledger';
export const BACKUP_DIR = '.scratch/panel-prompt-alignment/backup';
export const PANEL_DIR = 'assets/art/panel_web';

/** decision 取值。 */
export const DECISIONS = ['pass', 'regen'];
/** pass 对应的唯一理由。 */
export const PASS_REASONS = ['P0-pass'];
/** regen 对应的理由码：场景 / 道具 / 动作 / 月龄 / 安全 / 禁画项 / 画风。 */
export const REGEN_REASONS = ['A1-scene', 'A2-prop', 'A3-action', 'A4-age', 'A5-safety', 'A6-forbidden', 'A7-style'];
/** 一格在台账里的生命周期。 */
export const LEDGER_STATUSES = ['audited', 'regenerated', 'verified', 'needs-human', 'blocked'];

export const LEDGER_HEADER = 'key,prompt_hash,decision,reason,old_sha256,new_sha256,batch,attempt,status,ts';

const KEY_PATTERN = /^\d{3}-\d$/;
const SHA_PATTERN = /^[0-9a-f]{64}$/;
const CHAPTER_FILE = /^(ch\d{2})\.csv$/;

/** copyFileSync 的读+写替身：沙箱对 node 的 copyfile 系统调用报 EPERM，读写不受影响。 */
function copyByWrite(from, to) {
  writeFileSync(to, readFileSync(from));
}

/** 文本指纹：清单里存前 16 位，足够发现「提示词变了」。 */
export function hashText(text) {
  return createHash('sha256').update(String(text), 'utf8').digest('hex').slice(0, 16);
}

/** 图片指纹：整份 sha256。 */
export function hashFile(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

export function panelPath(root, key) {
  return join(root, PANEL_DIR, `${key}.jpg`);
}

export function backupPath(root, key, sha) {
  return join(root, BACKUP_DIR, `${key}-${sha.slice(0, 12)}.jpg`);
}

/**
 * 覆盖前备份原图。重复备份同一张图时按指纹命名，天然幂等。
 * @returns {{ oldSha: string, backup: string }}
 */
export function backupPanel(root, key) {
  const source = panelPath(root, key);
  if (!existsSync(source)) throw new Error(`${key}：找不到图片，无法备份`);
  const oldSha = hashFile(source);
  const backup = backupPath(root, key, oldSha);
  mkdirSync(join(root, BACKUP_DIR), { recursive: true });
  if (!existsSync(backup)) copyByWrite(source, backup);
  return { oldSha, backup };
}

/** 按指纹找回原图并写回。找不到备份就报错，绝不静默。 */
export function restorePanel(root, key, oldSha) {
  const backup = backupPath(root, key, oldSha);
  if (!existsSync(backup)) throw new Error(`${key}：备份区没有 ${oldSha.slice(0, 12)}，无法回滚`);
  copyByWrite(backup, panelPath(root, key));
  return backup;
}

/** 列出已经有台账的章。 */
export function ledgerChapters(root) {
  const dir = join(root, LEDGER_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .map((name) => CHAPTER_FILE.exec(name)?.[1])
    .filter(Boolean)
    .sort();
}

/**
 * 读入一章台账。解析失败时把问题放进 errors，不让坏行静默通过。
 * @returns {{ rows: Array<Record<string, string>>, errors: string[] }}
 */
export function readLedger(root, chapter) {
  const file = join(root, LEDGER_DIR, `${chapter}.csv`);
  const errors = [];
  const rows = [];
  if (!existsSync(file)) return { rows, errors };
  const lines = readFileSync(file, 'utf8').split(/\r?\n/).filter((line) => line.trim() !== '');
  lines.forEach((line, index) => {
    if (index === 0) {
      if (line !== LEDGER_HEADER) {
        errors.push(`${chapter}.csv 第 1 行：表头应为「${LEDGER_HEADER}」`);
      }
      return;
    }
    const cells = line.split(',');
    if (cells.length !== LEDGER_HEADER.split(',').length) {
      errors.push(`${chapter}.csv 第 ${index + 1} 行：应为 10 列，实际 ${cells.length} 列`);
      return;
    }
    const [key, promptHash, decision, reason, oldSha, newSha, batch, attempt, status, ts] = cells;
    rows.push({ key, promptHash, decision, reason, oldSha, newSha, batch, attempt, status, ts });
  });
  return { rows, errors };
}

/** 写出一章台账（表头 + 行）。行用 readLedger 的字段名，读写可往返。 */
export function writeLedger(root, chapter, rows) {
  mkdirSync(join(root, LEDGER_DIR), { recursive: true });
  const body = rows.map((row) =>
    LEDGER_COLUMNS.map((column) => row[COLUMN_FIELD[column]] ?? row[column] ?? '').join(','),
  );
  writeFileSync(join(root, LEDGER_DIR, `${chapter}.csv`), [LEDGER_HEADER, ...body].join('\n') + '\n');
}

const LEDGER_COLUMNS = LEDGER_HEADER.split(',');
/** CSV 列名 → readLedger 返回的字段名。 */
const COLUMN_FIELD = {
  key: 'key',
  prompt_hash: 'promptHash',
  decision: 'decision',
  reason: 'reason',
  old_sha256: 'oldSha',
  new_sha256: 'newSha',
  batch: 'batch',
  attempt: 'attempt',
  status: 'status',
  ts: 'ts',
};

/**
 * 校验台账与图片、提示词是否自洽。
 *
 * 覆盖口径：一章台账可以只落部分格子（逐游戏推进、跨章插队），未落账的格子视为未处理，
 * 只进 status.covered / status.total，不报错。台账一旦写了行，就按硬规则从严。
 * @param {{
 *   root: string,
 *   chapterKeys: Map<string, Set<string>>,
 *   promptHashes: Map<string, string>,
 *   assetKeys: Set<string>,
 * }} input
 */
export function validateLedgers({ root, chapterKeys, promptHashes, assetKeys }) {
  const errors = [];
  const warnings = [];
  const status = {
    chapters: 0,
    rows: 0,
    pass: 0,
    regen: 0,
    verified: 0,
    needsHuman: 0,
    blocked: 0,
    covered: 0,
    total: 0,
    coverage: [],
  };
  const coveredByChapter = new Map();

  for (const chapter of ledgerChapters(root)) {
    status.chapters += 1;
    const keys = chapterKeys.get(chapter);
    if (!keys) {
      errors.push(`${chapter}.csv：本章没有对应的提示词章`);
      continue;
    }
    const coveredKeys = new Set();
    coveredByChapter.set(chapter, coveredKeys);

    const { rows, errors: parseErrors } = readLedger(root, chapter);
    errors.push(...parseErrors);

    const seen = new Set();
    for (const row of rows) {
      status.rows += 1;
      const { key } = row;
      const where = `${chapter}.csv ${key}`;

      if (!KEY_PATTERN.test(key)) errors.push(`${where}：key 格式应为 NNN-K`);
      if (seen.has(key)) errors.push(`${where}：重复行`);
      seen.add(key);
      if (keys && !keys.has(key)) errors.push(`${where}：不属于本章的键`);
      if (keys?.has(key)) coveredKeys.add(key);
      if (assetKeys && !assetKeys.has(key)) errors.push(`${where}：磁盘上没有这张图`);

      if (!DECISIONS.includes(row.decision)) errors.push(`${where}：decision 只能是 ${DECISIONS.join('/')}`);
      if (!LEDGER_STATUSES.includes(row.status)) {
        errors.push(`${where}：status 只能是 ${LEDGER_STATUSES.join('/')}`);
      }

      const allowedReasons = row.decision === 'pass' ? PASS_REASONS : REGEN_REASONS;
      if (DECISIONS.includes(row.decision) && !allowedReasons.includes(row.reason)) {
        errors.push(`${where}：decision=${row.decision} 时 reason 应为 ${allowedReasons.join('/')}`);
      }

      if (row.promptHash && row.promptHash !== promptHashes.get(key)) {
        errors.push(`${where}：prompt_hash 已过期，提示词变过，需要重新比对`);
      }
      if (!row.promptHash) errors.push(`${where}：缺少 prompt_hash`);

      if (row.decision === 'regen') {
        if (!SHA_PATTERN.test(row.oldSha ?? '')) errors.push(`${where}：regen 缺少合法的 old_sha256`);
        if (!SHA_PATTERN.test(row.newSha ?? '')) errors.push(`${where}：regen 缺少合法的 new_sha256`);
        if (row.oldSha && row.oldSha === row.newSha) errors.push(`${where}：old_sha256 与 new_sha256 相同`);
        if (SHA_PATTERN.test(row.oldSha ?? '') && !existsSync(backupPath(root, key, row.oldSha))) {
          errors.push(`${where}：备份区找不到 old_sha256 对应的原图，不允许覆盖`);
        }
      } else if (row.oldSha) {
        errors.push(`${where}：pass 行不应携带 old_sha256`);
      }

      if (row.status === 'verified') {
        if (!SHA_PATTERN.test(row.newSha ?? '')) {
          errors.push(`${where}：verified 缺少合法的 new_sha256`);
        } else {
          const file = panelPath(root, key);
          const diskSha = existsSync(file) ? hashFile(file) : '';
          if (diskSha !== row.newSha) {
            errors.push(`${where}：磁盘图片指纹与 new_sha256 不一致`);
          }
        }
      }

      if (!/^\d+$/.test(row.attempt ?? '') || Number(row.attempt) < 1) {
        errors.push(`${where}：attempt 应为正整数`);
      }
      if (!row.ts) errors.push(`${where}：缺少 ts`);
      if (!row.batch) errors.push(`${where}：缺少 batch`);

      if (row.status === 'verified') status.verified += 1;
      if (row.status === 'needs-human') status.needsHuman += 1;
      if (row.status === 'blocked') status.blocked += 1;
      if (row.decision === 'pass') status.pass += 1;
      if (row.decision === 'regen') status.regen += 1;
    }
  }

  status.coverage = [...chapterKeys.keys()].sort().map((chapter) => ({
    chapter,
    covered: coveredByChapter.get(chapter)?.size ?? 0,
    total: chapterKeys.get(chapter).size,
  }));
  status.covered = status.coverage.reduce((sum, item) => sum + item.covered, 0);
  status.total = status.coverage.reduce((sum, item) => sum + item.total, 0);

  return { errors, warnings, status };
}

/** 命令行：skeleton / hash / disk / backup / restore，供批处理与人工操作。 */
function main(argv) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const [command, ...args] = argv;
  if (command === 'skeleton') {
    const { presets, entries } = loadPromptDir(root);
    const chapter = args[0];
    const rows = entries
    .filter((entry) => entry.chapter === chapter)
    .map((entry) => ({
      key: entry.key,
      prompt_hash: hashText(composePrompt(entry, presets)),
      decision: '',
      reason: '',
      old_sha256: '',
      new_sha256: '',
      batch: '',
      attempt: '1',
      status: '',
      ts: '',
    }));
    process.stdout.write([LEDGER_HEADER, ...rows.map((row) => LEDGER_COLUMNS.map((c) => row[c]).join(','))].join('\n') + '\n');
    return;
  }
  if (command === 'hash') {
    const { presets, entries } = loadPromptDir(root);
    const entry = entries.find((item) => item.key === args[0]);
    if (!entry) throw new Error(`找不到提示词 ${args[0]}`);
    console.log(hashText(composePrompt(entry, presets)));
    return;
  }
  if (command === 'disk') {
    console.log(hashFile(panelPath(root, args[0])));
    return;
  }
  if (command === 'backup') {
    const result = backupPanel(root, args[0]);
    console.log(`${result.oldSha}\t${result.backup}`);
    return;
  }
  if (command === 'restore') {
    restorePanel(root, args[0], args[1]);
    console.log('restored');
    return;
  }
  throw new Error('用法：panel-ledger.mjs skeleton <chNN> | hash <key> | disk <key> | backup <key> | restore <key> <sha>');
}

if (process.argv[1] && process.argv[1].endsWith('panel-ledger.mjs')) {
  main(process.argv.slice(2));
}
