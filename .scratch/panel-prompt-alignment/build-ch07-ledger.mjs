// 一次性脚本：从骨架 + 审计/重画结果装配 ch07 台账
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';

const root = '/home/wall/vibe/babyGame';
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

const skeleton = readFileSync(`${root}/reports/panel-ledger/ch07.csv`, 'utf8').trim().split('\n').slice(1);
const oldSha = Object.fromEntries(readFileSync(`${root}/.scratch/panel-prompt-alignment/ch07-old-sha.txt`, 'utf8').trim().split('\n').map(l => l.split(' ')));

const regen = {
  '023-1': ['A2-prop', 'ch07-b01'], '023-2': ['A3-action', 'ch07-b01'], '023-3': ['A2-prop', 'ch07-b01'],
  '023-4': ['A2-prop', 'ch07-b01'], '024-1': ['A1-scene', 'ch07-b01'], '024-2': ['A1-scene', 'ch07-b01'],
  '024-4': ['A1-scene', 'ch07-b01'], '025-1': ['A2-prop', 'ch07-b01'], '025-3': ['A3-action', 'ch07-b01'],
  '025-4': ['A3-action', 'ch07-b01'], '026-2': ['A1-scene', 'ch07-b02'], '027-1': ['A3-action', 'ch07-b02'],
  '027-2': ['A1-scene', 'ch07-b02'], '027-3': ['A2-prop', 'ch07-b02'], '028-3': ['A3-action', 'ch07-b02'],
  '030-2': ['A3-action', 'ch07-b02'], '030-3': ['A3-action', 'ch07-b02'], '030-4': ['A3-action', 'ch07-b02'],
  '031-2': ['A3-action', 'ch07-b02'], '031-4': ['A1-scene', 'ch07-b02'], '032-1': ['A3-action', 'ch07-b03'],
  '032-3': ['A3-action', 'ch07-b03'], '032-4': ['A2-prop', 'ch07-b03'], '033-3': ['A2-prop', 'ch07-b03'],
  '034-1': ['A3-action', 'ch07-b03'], '034-2': ['A1-scene', 'ch07-b03'], '034-3': ['A3-action', 'ch07-b03'],
};
const attempt2 = new Set(['023-3','024-1','024-4','025-1','025-4','026-2','027-3','032-3','034-2','034-3']);
const needsHuman = new Set(['024-1','025-1','025-4','032-3']);

const ts = execSync('date +%Y-%m-%dT%H:%M:%S+08:00').toString().trim();
const rows = skeleton.map((line) => {
  const [key, promptHash] = line.split(',');
  const disk = sha(`${root}/assets/art/panel_web/${key}.jpg`);
  if (!regen[key]) {
    return [key, promptHash, 'pass', 'P0-pass', '', disk, 'ch07-audit', '1', 'verified', ts].join(',');
  }
  const [reason, batch] = regen[key];
  const attempt = attempt2.has(key) ? '2' : '1';
  const status = needsHuman.has(key) ? 'needs-human' : 'verified';
  return [key, promptHash, 'regen', reason, oldSha[key], disk, batch, attempt, status, ts].join(',');
});
writeFileSync(`${root}/reports/panel-ledger/ch07.csv`, ['key,prompt_hash,decision,reason,old_sha256,new_sha256,batch,attempt,status,ts', ...rows].join('\n') + '\n');
const v = rows.filter(r => r.includes(',verified,')).length;
const nh = rows.filter(r => r.includes(',needs-human,')).length;
console.log(`rows=${rows.length} verified=${v} needs-human=${nh}`);
