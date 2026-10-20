import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  backupPanel,
  hashFile,
  hashText,
  LEDGER_HEADER,
  ledgerChapters,
  panelPath,
  readLedger,
  restorePanel,
  validateLedgers,
} from '../tools/panel-ledger.mjs';

const CHAPTER_KEYS = new Map([['ch05', new Set(['006-1', '006-2'])]]);
const ASSET_KEYS = new Set(['006-1', '006-2']);
const PROMPT_HASHES = new Map([
  ['006-1', hashText('第一格提示词')],
  ['006-2', hashText('第二格提示词')],
]);

const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), 'panel-ledger-'));
  mkdirSync(join(root, 'reports/panel-ledger'), { recursive: true });
  mkdirSync(join(root, 'assets/art/panel_web'), { recursive: true });
  writeFileSync(join(root, 'assets/art/panel_web/006-1.jpg'), 'old-image-1');
  writeFileSync(join(root, 'assets/art/panel_web/006-2.jpg'), 'old-image-2');
  return root;
};

const row = (overrides = {}) => ({
  key: '006-1',
  promptHash: PROMPT_HASHES.get('006-1'),
  decision: 'pass',
  reason: 'P0-pass',
  oldSha: '',
  newSha: '',
  batch: 'ch05-b01',
  attempt: '1',
  status: 'audited',
  ts: '2026-10-21T09:00:00+08:00',
  ...overrides,
});

const writeLedgerFile = (root, rows, header = LEDGER_HEADER) => {
  const body = rows.map((values) => LEDGER_COLUMNS(values).join(','));
  writeFileSync(join(root, 'reports/panel-ledger/ch05.csv'), [header, ...body].join('\n') + '\n');
};

const LEDGER_COLUMNS = (row) =>
  [row.key, row.promptHash, row.decision, row.reason, row.oldSha, row.newSha, row.batch, row.attempt, row.status, row.ts];

test('全绿账：pass 与已验证的 regen 都不报错', () => {
  const root = fixture();
  backupPanel(root, '006-2');
  const oldSha = hashFile(panelPath(root, '006-2'));
  writeFileSync(panelPath(root, '006-2'), 'new-image-2');
  const newSha = hashFile(panelPath(root, '006-2'));
  const passDiskSha = hashFile(panelPath(root, '006-1'));
  writeLedgerFile(root, [
    row({ newSha: passDiskSha }),
    row({ key: '006-2', promptHash: PROMPT_HASHES.get('006-2'), decision: 'regen', reason: 'A2-prop', oldSha, newSha, status: 'verified' }),
  ]);

  const { errors, status } = validateLedgers({ root, chapterKeys: CHAPTER_KEYS, promptHashes: PROMPT_HASHES, assetKeys: ASSET_KEYS });
  assert.deepEqual(errors, []);
  assert.equal(status.chapters, 1);
  assert.equal(status.rows, 2);
  assert.equal(status.pass, 1);
  assert.equal(status.regen, 1);
  assert.equal(status.verified, 1);
  rmSync(root, { recursive: true, force: true });
});

test('缺行、重复行与不属于本章的键都要报错', () => {
  const root = fixture();
  writeLedgerFile(root, [row(), row()]);
  const { errors } = validateLedgers({ root, chapterKeys: CHAPTER_KEYS, promptHashes: PROMPT_HASHES, assetKeys: ASSET_KEYS });
  assert.ok(errors.some((error) => error.includes('006-1：重复行')));
  assert.ok(errors.some((error) => error.includes('006-2：缺少台账行')));

  writeLedgerFile(root, [row({ key: '099-9' }), row({ key: '006-2' })]);
  const unknown = validateLedgers({ root, chapterKeys: CHAPTER_KEYS, promptHashes: PROMPT_HASHES, assetKeys: ASSET_KEYS });
  assert.ok(unknown.errors.some((error) => error.includes('099-9：不属于本章的键')));
  assert.ok(unknown.errors.some((error) => error.includes('099-9：磁盘上没有这张图')));
  rmSync(root, { recursive: true, force: true });
});

test('状态越界、decision 与 reason 搭配错误、pass 行带指纹都要报错', () => {
  const root = fixture();
  writeLedgerFile(root, [
    row({ status: 'done' }),
    row({ key: '006-2', decision: 'pass', reason: 'A2-prop' }),
  ]);
  const { errors } = validateLedgers({ root, chapterKeys: CHAPTER_KEYS, promptHashes: PROMPT_HASHES, assetKeys: ASSET_KEYS });
  assert.ok(errors.some((error) => error.includes('status 只能是')));
  assert.ok(errors.some((error) => error.includes('006-2：decision=pass 时 reason 应为 P0-pass')));
  rmSync(root, { recursive: true, force: true });
});

test('prompt_hash 过期要报错', () => {
  const root = fixture();
  writeLedgerFile(root, [row({ promptHash: 'stale-hash' })]);
  const { errors } = validateLedgers({ root, chapterKeys: CHAPTER_KEYS, promptHashes: PROMPT_HASHES, assetKeys: ASSET_KEYS });
  assert.ok(errors.some((error) => error.includes('prompt_hash 已过期')));
  rmSync(root, { recursive: true, force: true });
});

test('regen 缺指纹、新旧相同、备份缺失都要报错', () => {
  const root = fixture();
  const oldSha = hashFile(panelPath(root, '006-1'));
  writeLedgerFile(root, [
    row({ key: '006-1', decision: 'regen', reason: 'A3-action', status: 'regenerated' }),
    row({ key: '006-2', decision: 'regen', reason: 'A3-action', oldSha, newSha: oldSha, status: 'regenerated' }),
  ]);
  const { errors } = validateLedgers({ root, chapterKeys: CHAPTER_KEYS, promptHashes: PROMPT_HASHES, assetKeys: ASSET_KEYS });
  assert.ok(errors.some((error) => error.includes('006-1：regen 缺少合法的 old_sha256')));
  assert.ok(errors.some((error) => error.includes('006-2：old_sha256 与 new_sha256 相同')));
  assert.ok(errors.some((error) => error.includes('006-2：备份区找不到')));
  rmSync(root, { recursive: true, force: true });
});

test('verified 的磁盘指纹与 new_sha256 不一致要报错', () => {
  const root = fixture();
  const oldSha = hashFile(panelPath(root, '006-1'));
  backupPanel(root, '006-1');
  writeFileSync(panelPath(root, '006-1'), 'regenerated-image');
  writeLedgerFile(root, [
    row({ key: '006-1', decision: 'regen', reason: 'A3-action', oldSha, newSha: 'f'.repeat(64), status: 'verified' }),
  ]);
  const { errors } = validateLedgers({ root, chapterKeys: CHAPTER_KEYS, promptHashes: PROMPT_HASHES, assetKeys: ASSET_KEYS });
  assert.ok(errors.some((error) => error.includes('磁盘图片指纹与 new_sha256 不一致')));
  rmSync(root, { recursive: true, force: true });
});

test('坏行与坏表头要报错，不让解析静默通过', () => {
  const root = fixture();
  writeFileSync(join(root, 'reports/panel-ledger/ch05.csv'), 'a,b\n1,2,3\n');
  const { errors } = readLedger(root, 'ch05');
  assert.ok(errors.some((error) => error.includes('表头')));
  assert.ok(errors.some((error) => error.includes('应为 10 列')));
  rmSync(root, { recursive: true, force: true });
});

test('备份与回滚：指纹可还原，找不到备份就报错', () => {
  const root = fixture();
  const before = hashFile(panelPath(root, '006-1'));
  const { oldSha, backup } = backupPanel(root, '006-1');
  assert.equal(oldSha, before);
  assert.ok(existsSync(backup));

  writeFileSync(panelPath(root, '006-1'), 'regenerated-image');
  assert.notEqual(hashFile(panelPath(root, '006-1')), before);

  restorePanel(root, '006-1', oldSha);
  assert.equal(hashFile(panelPath(root, '006-1')), before);

  assert.throws(() => restorePanel(root, '006-2', 'a'.repeat(64)), /无法回滚/);
  rmSync(root, { recursive: true, force: true });
});

test('ledgerChapters 只认 chNN.csv', () => {
  const root = fixture();
  writeLedgerFile(root, [row()]);
  writeFileSync(join(root, 'reports/panel-ledger/README.md'), '说明');
  writeFileSync(join(root, 'reports/panel-ledger/summary.csv'), LEDGER_HEADER + '\n');
  assert.deepEqual(ledgerChapters(root), ['ch05']);
  rmSync(root, { recursive: true, force: true });
});
