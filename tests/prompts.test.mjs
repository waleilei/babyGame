import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  composePrompt,
  loadAssetKeys,
  loadGameIndex,
  loadPromptDir,
  normalizeCamera,
  parsePromptFile,
  sceneForPlace,
  sceneOptions,
  validatePrompts,
} from '../tools/prompt-catalog.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const PRESETS = {
  style: '风格。',
  character: '人物{age}。',
  negative: [{ value: '文字' }, { value: '学步车' }],
  cameras: new Map([
    ['eye-level', { id: 'eye-level', name: '平视中景', aliases: [] }],
    ['close-up', { id: 'close-up', name: '特写', aliases: [] }],
  ]),
  scenes: new Map([
    [
      'living-room',
      { id: 'living-room', name: '客厅', places: ['地垫'], full: '客厅全景', brief: '客厅一角' },
    ],
  ]),
};

const ENTRY = {
  key: '006-1',
  gameId: '006',
  panel: 1,
  gameName: '蹬腿自行车',
  chapter: 'ch05',
  fields: {
    镜头: 'eye-level',
    场景: 'living-room',
    月龄: '0-3月',
    动作: '宝宝仰卧，妈妈握住小腿',
    道具: '无',
    状态: 'draft',
  },
};

const GAMES = new Map([
  ['006', { id: '006', name: '蹬腿自行车', age: '0-3月', place: '地垫', docId: 'ch05' }],
]);

const ASSETS = new Set(['006-1']);

const fixture = (overrides = {}) => ({
  key: ENTRY.key,
  gameId: ENTRY.gameId,
  panel: ENTRY.panel,
  gameName: ENTRY.gameName,
  chapter: ENTRY.chapter,
  fields: { ...ENTRY.fields, ...overrides },
});

test('解析格层文件：标题、字段与行号', () => {
  const text = [
    '# 第5章 测试',
    '',
    '### 006-1　蹬腿自行车｜步骤图 1',
    '',
    '- **镜头**：eye-level',
    '- **场景**：living-room',
    '- **月龄**：0-3月',
    '- **动作**：宝宝仰卧',
    '- **道具**：无',
    '- **状态**：draft',
    '',
  ].join('\n');

  const { entries, errors } = parsePromptFile(text, { file: 'ch05.md' });
  assert.deepEqual(errors, []);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].key, '006-1');
  assert.equal(entries[0].chapter, 'ch05');
  assert.equal(entries[0].fields['动作'], '宝宝仰卧');
});

test('解析格层文件：未知写法、重复字段与标题错位都要报错', () => {
  const text = [
    '- **镜头**：eye-level',
    '### 006-1　蹬腿自行车｜步骤图 2',
    '- **镜头**：eye-level',
    '- **镜头**：close-up',
    '随便一句话',
  ].join('\n');

  const { errors } = parsePromptFile(text, { file: 'ch05.md' });
  assert.equal(errors.length, 4);
  assert.match(errors[0], /在任何步骤图标题之前/);
  assert.match(errors[1], /步骤图 2/);
  assert.match(errors[2], /重复出现/);
  assert.match(errors[3], /无法识别/);
});

test('组合：固定顺序、标点与省略空道具', () => {
  assert.equal(
    composePrompt(ENTRY, PRESETS),
    '风格。人物0-3月。平视中景，客厅全景。宝宝仰卧，妈妈握住小腿。避免：文字、学步车。',
  );
  assert.equal(
    composePrompt(fixture({ 道具: '摇铃1个' }), PRESETS),
    '风格。人物0-3月。平视中景，客厅全景。宝宝仰卧，妈妈握住小腿。道具：摇铃1个。避免：文字、学步车。',
  );
});

test('组合：特写取场景的 brief 文案', () => {
  const text = composePrompt(fixture({ 镜头: 'close-up' }), PRESETS);
  assert.match(text, /特写，客厅一角。/);
});

test('场地归场景：复合值首项优先，任意不限', () => {
  const presets = {
    scenes: new Map([
      ['living-room', { id: 'living-room', places: ['地垫', '客厅'] }],
      ['bedroom', { id: 'bedroom', places: ['床'] }],
    ]),
  };
  assert.equal(sceneForPlace('床/地垫', presets), 'bedroom');
  assert.equal(sceneForPlace('地垫/床', presets), 'living-room');
  assert.equal(sceneForPlace('不存在', presets), 'indoor');
  assert.deepEqual([...sceneOptions('床/地垫', presets)].sort(), ['bedroom', 'living-room']);
  assert.equal(sceneOptions('任意', presets), null);
});

test('校验：缺字段、未知 id、月龄不符与禁画项', () => {
  const entries = [
    fixture({ 镜头: 'zoom-in' }),
    fixture({ 场景: 'park', 动作: '宝宝推学步车' }),
    fixture({ 月龄: '4-6月' }),
  ].map((entry, index) => ({ ...entry, key: `006-${index + 1}` }));

  const { errors, warnings } = validatePrompts({
    entries,
    presets: PRESETS,
    games: GAMES,
    assetKeys: new Set(entries.map((entry) => entry.key)),
  });

  assert.ok(errors.some((error) => /镜头「zoom-in」不在词表内/.test(error)));
  assert.ok(errors.some((error) => /场景「park」不在字典内/.test(error)));
  assert.ok(errors.some((error) => /画面描述出现禁画项「学步车」/.test(error)));
  assert.ok(errors.some((error) => /月龄「4-6月」与游戏数据「0-3月」不一致/.test(error)));
  assert.ok(warnings.some((warning) => /应有 4 张步骤图/.test(warning)));
});

test('校验：缺字段要报错', () => {
  const missing = { ...ENTRY, fields: { ...ENTRY.fields, 动作: '' } };
  const { errors } = validatePrompts({
    entries: [missing],
    presets: PRESETS,
    games: GAMES,
    assetKeys: new Set(['006-1']),
  });
  assert.ok(errors.some((error) => error.includes('缺少「动作」')));
});

test('校验：键与图片双向一致', () => {
  const { errors } = validatePrompts({
    entries: [fixture()],
    presets: PRESETS,
    games: GAMES,
    assetKeys: new Set(['006-1', '006-2']),
  });
  assert.ok(errors.some((error) => error.includes('006-2：有图片但缺少提示词')));

  const reverse = validatePrompts({
    entries: [fixture()],
    presets: PRESETS,
    games: GAMES,
    assetKeys: new Set(),
  });
  assert.ok(reverse.errors.some((error) => error.includes('006-1：有提示词但没有对应图片')));
});

test('校验：统计 reviewed 与 draft', () => {
  const entries = [fixture({ 状态: 'reviewed' }), { ...fixture(), key: '006-2' }];
  const { status } = validatePrompts({
    entries,
    presets: PRESETS,
    games: GAMES,
    assetKeys: new Set(['006-1', '006-2']),
  });
  assert.deepEqual(status, { total: 2, reviewed: 1, draft: 1 });
});

test('镜头归一：名称与别名都映射到 id，未登记写法报错', () => {
  const presets = {
    cameras: new Map([['close-up', { id: 'close-up', name: '特写', aliases: ['手部特写'] }]]),
  };
  assert.equal(normalizeCamera('特写', presets), 'close-up');
  assert.equal(normalizeCamera('手部特写', presets), 'close-up');
  assert.throws(() => normalizeCamera('显微镜', presets), /没有登记/);
});

test('校验：道具可省略', () => {
  const entry = { ...ENTRY, fields: { ...ENTRY.fields } };
  delete entry.fields['道具'];
  const { errors } = validatePrompts({
    entries: [entry],
    presets: PRESETS,
    games: GAMES,
    assetKeys: new Set(['006-1']),
  });
  assert.equal(errors.filter((error) => error.includes('道具')).length, 0);
});

test('校验：重复编号与动作结尾标点', () => {
  const { errors } = validatePrompts({
    entries: [fixture(), fixture({ 动作: '宝宝笑。' })],
    presets: PRESETS,
    games: GAMES,
    assetKeys: new Set(['006-1']),
  });
  assert.ok(errors.some((error) => error.includes('步骤图编号重复')));
  assert.ok(errors.some((error) => error.includes('动作结尾不要标点')));
});

test('校验：复合场地内的场景覆盖不报警，超出集合才报警', () => {
  const games = new Map([['006', { id: '006', age: '0-3月', place: '床/地垫', docId: 'ch05' }]]);
  const presets = {
    ...PRESETS,
    scenes: new Map([
      ['living-room', { id: 'living-room', name: '客厅', places: ['地垫'], full: '客厅', brief: '客厅一角' }],
      ['bedroom', { id: 'bedroom', name: '卧室', places: ['床'], full: '卧室', brief: '卧室一角' }],
    ]),
  };

  const allowed = validatePrompts({
    entries: [fixture({ 场景: 'living-room' })],
    presets,
    games,
    assetKeys: new Set(['006-1']),
  });
  assert.equal(allowed.warnings.filter((warning) => warning.includes('允许的集合')).length, 0);

  const outside = validatePrompts({
    entries: [fixture({ 场景: 'kitchen' })],
    presets,
    games,
    assetKeys: new Set(['006-1']),
  });
  assert.ok(outside.warnings.some((warning) => warning.includes('允许的集合')));
});

test('真实目录：520 条、键与图片一致、零错误零警告', () => {
  const { presets, entries, errors } = loadPromptDir(ROOT);
  assert.deepEqual(errors, []);
  assert.equal(entries.length, 520);

  const result = validatePrompts({
    entries,
    presets,
    games: loadGameIndex(ROOT),
    assetKeys: loadAssetKeys(ROOT),
  });

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
  assert.equal(result.status.total, 520);
  assert.equal(result.status.reviewed + result.status.draft, 520);
  assert.ok(result.status.reviewed >= 40, '第 5 章应保持已复核');
});
