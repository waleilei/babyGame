import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';

/** 格层字段，顺序即文档里的书写顺序。 */
export const FIELD_KEYS = ['镜头', '场景', '月龄', '动作', '道具', '状态'];

export const STATUSES = ['draft', 'reviewed'];

/** 内容层禁画项。负面层本身含有这些词，所以只在「避免：」之前检查。 */
export const BANNED = ['学步车', '脖圈', '床围', '趴睡', '手机哄娃', '整粒坚果', '蜂蜜'];

/** 特写镜头取场景的 brief 文案。 */
export const BRIEF_CAMERAS = new Set(['close-up']);

export const MAX_PROMPT_LENGTH = 380;

const HEADING = /^### (\d{3})-(\d)　(.+)｜步骤图 (\d)$/;
const FIELD = /^- \*\*(镜头|场景|月龄|动作|道具|状态)\*\*：(.+)$/;
const DASH = /^- \*\*(.+?)\*\*：(.+)$/;

const chapterOf = (file) => basename(file, '.md');

/**
 * 解析一章的格层文件。
 * @param {string} text
 * @param {{ file?: string }} [options]
 */
export function parsePromptFile(text, { file = '' } = {}) {
  const lines = String(text).split(/\r?\n/);
  const entries = [];
  const errors = [];
  let current = null;

  const flush = () => {
    if (current) entries.push(current);
    current = null;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const where = `${chapterOf(file)} 第 ${index + 1} 行`;
    if (line.trim() === '') continue;
    if (line.startsWith('# ') || line.startsWith('> ') || line.trim() === '---') {
      flush();
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      const [, gameId, panel, name, declared] = heading;
      if (declared !== panel) {
        errors.push(`${where}：标题写的是步骤图 ${declared}，编号却是 ${gameId}-${panel}`);
      }
      current = {
        key: `${gameId}-${panel}`,
        gameId,
        panel: Number(panel),
        gameName: name.trim(),
        chapter: chapterOf(file),
        fields: {},
        line: index + 1,
        file,
      };
      continue;
    }

    const field = FIELD.exec(line);
    if (field) {
      if (!current) {
        errors.push(`${where}：字段出现在任何步骤图标题之前`);
        continue;
      }
      const [, key, value] = field;
      if (current.fields[key] !== undefined) {
        errors.push(`${where}：${current.key} 的「${key}」重复出现`);
      }
      current.fields[key] = value.trim();
      continue;
    }

    errors.push(`${where}：无法识别的内容「${line.trim()}」`);
  }

  flush();
  return { entries, errors };
}

function fieldMap(text) {
  const map = {};
  for (const line of String(text).split(/\r?\n/)) {
    const match = DASH.exec(line.trim());
    if (match) map[match[1].trim()] = match[2].trim();
  }
  return map;
}

function sections(text, pattern) {
  const result = [];
  let current = null;
  for (const line of String(text).split(/\r?\n/)) {
    const heading = pattern.exec(line.trim());
    if (heading) {
      current = { id: heading[1], lines: [] };
      result.push(current);
      continue;
    }
    if (current) current.lines.push(line);
  }
  return result.map(({ id, lines }) => ({ id, fields: fieldMap(lines.join('\n')) }));
}

export function parseCameraPreset(text) {
  const cameras = new Map();
  for (const { id, fields } of sections(text, /^## ([a-z-]+)$/)) {
    if (!fields['名称']) continue;
    cameras.set(id, {
      id,
      name: fields['名称'],
      aliases: (fields['别名'] ?? '')
        .split('、')
        .map((alias) => alias.trim())
        .filter(Boolean),
    });
  }
  return cameras;
}

export function parseScenePreset(text) {
  const scenes = new Map();
  for (const { id, fields } of sections(text, /^## ([a-z-]+)$/)) {
    if (!fields['名称'] || !fields.full || !fields.brief) continue;
    scenes.set(id, {
      id,
      name: fields['名称'],
      places: (fields['场地'] ?? '')
        .split('、')
        .map((place) => place.trim())
        .filter(Boolean),
      full: fields.full,
      brief: fields.brief,
    });
  }
  return scenes;
}

export function parseNegativePreset(text) {
  const items = [];
  for (const line of String(text).split(/\r?\n/)) {
    const match = DASH.exec(line.trim());
    if (match) items.push({ key: match[1].trim(), value: match[2].trim() });
  }
  return items;
}

export function parseStylePreset(text) {
  return fieldMap(text)['文本'] ?? '';
}

export function parseCharacterPreset(text) {
  return fieldMap(text)['模板'] ?? '';
}

export function readPresets(root) {
  const dir = join(root, 'presets');
  const read = (name) => readFileSync(join(dir, name), 'utf8');
  const presets = {
    style: parseStylePreset(read('style.md')),
    character: parseCharacterPreset(read('character.md')),
    negative: parseNegativePreset(read('negative.md')),
    cameras: parseCameraPreset(read('camera.md')),
    scenes: parseScenePreset(read('scene.md')),
  };
  const errors = [];
  if (!presets.style) errors.push('presets/style.md 缺少「文本」');
  if (!presets.character) errors.push('presets/character.md 缺少「模板」');
  if (!presets.character.includes('{age}')) errors.push('presets/character.md 的模板缺少 {age} 占位');
  if (!presets.negative.length) errors.push('presets/negative.md 没有任何一类');
  if (!presets.cameras.size) errors.push('presets/camera.md 没有任何镜头');
  if (!presets.scenes.size) errors.push('presets/scene.md 没有任何场景');
  return { presets, errors };
}

/**
 * 读入整份提示词目录：预设加全部章节文件。
 * @param {string} root 仓库根目录
 */
export function loadPromptDir(root) {
  const { presets, errors: presetErrors } = readPresets(join(root, 'prompts'));
  const dir = join(root, 'prompts');
  const files = readdirSync(dir)
    .filter((name) => /^ch\d{2}\.md$/.test(name))
    .sort();

  const entries = [];
  const errors = [...presetErrors];
  for (const name of files) {
    const { entries: parsed, errors: fileErrors } = parsePromptFile(readFileSync(join(dir, name), 'utf8'), {
      file: name,
    });
    entries.push(...parsed);
    errors.push(...fileErrors);
  }
  return { presets, entries, files, errors };
}

/**
 * 从目录与章节数据里建立游戏索引。
 * @param {string} root
 */
export function loadGameIndex(root) {
  const toc = JSON.parse(readFileSync(join(root, 'data/toc.json'), 'utf8'));
  const games = new Map();
  for (const doc of toc.docs.filter((item) => item.kind === 'games')) {
    const chapter = JSON.parse(readFileSync(join(root, 'data', doc.file), 'utf8'));
    for (const game of chapter.games) {
      const id = String(game.id).padStart(3, '0');
      games.set(id, {
        id,
        name: game.name,
        age: game.age,
        place: game.place,
        materials: game.materials,
        docId: doc.id,
      });
    }
  }
  return games;
}

/**
 * 从图片目录读出步骤图键集合。
 * @param {string} root
 */
export function loadAssetKeys(root) {
  const dir = join(root, 'assets/art/panel_web');
  if (!existsSync(dir)) return new Set();
  return new Set(
    readdirSync(dir)
      .map((name) => /^(\d{3}-\d)\.jpg$/.exec(name)?.[1])
      .filter(Boolean),
  );
}

/**
 * 把场地字段归到场景 id：取第一段，未命中用 indoor。
 * @param {string} place
 * @param {{ scenes: Map<string, { places: string[] }> }} presets
 */
export function sceneForPlace(place, presets) {
  const first = String(place ?? '').split('/')[0].trim();
  for (const scene of presets.scenes.values()) {
    if (scene.places.includes(first)) return scene.id;
  }
  return 'indoor';
}

/**
 * 场地字段允许的全部场景：复合值每一段都算数；写「任意」时不限制。
 * @param {string} place
 * @param {{ scenes: Map<string, { places: string[] }> }} presets
 * @returns {Set<string> | null} null 表示任意场景都可以
 */
export function sceneOptions(place, presets) {
  const parts = String(place ?? '')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.includes('任意')) return null;
  const allowed = new Set();
  for (const part of parts) {
    for (const scene of presets.scenes.values()) {
      if (scene.places.includes(part)) allowed.add(scene.id);
    }
  }
  return allowed;
}

/**
 * 按固定顺序拼出最终文案。
 * @param {{ fields: Record<string, string> }} entry
 * @param {ReturnType<typeof readPresets>['presets']} presets
 */
export function composePrompt(entry, presets) {
  const { fields } = entry;
  const camera = presets.cameras.get(fields['镜头']);
  const scene = presets.scenes.get(fields['场景']);
  const cameraName = camera ? camera.name : fields['镜头'];
  const sceneText = scene ? (BRIEF_CAMERAS.has(fields['镜头']) ? scene.brief : scene.full) : fields['场景'];
  const character = presets.character.replaceAll('{age}', fields['月龄'] ?? '');
  const action = String(fields['动作'] ?? '').replace(/[。；;]\s*$/, '');
  const props = fields['道具'];
  const negative = presets.negative.map((item) => item.value).join('、');
  const propText = props && props !== '无' ? `道具：${props}。` : '';
  return `${presets.style}${character}${cameraName}，${sceneText}。${action}。${propText}避免：${negative}。`;
}

const sameActions = (entries) => {
  const actions = entries.map((entry) => entry.fields['动作']);
  return actions.some((action, index) => actions.indexOf(action) !== index);
};

/**
 * 校验整份目录。
 * @param {{ entries: any[], presets: any, games: Map<string, any>, assetKeys: Set<string> }} input
 */
export function validatePrompts({ entries, presets, games, assetKeys }) {
  const errors = [];
  const warnings = [];
  const seen = new Map();
  const byGame = new Map();

  for (const entry of entries) {
    const { fields } = entry;
    const id = entry.key;

    if (seen.has(id)) errors.push(`${id}：步骤图编号重复`);
    seen.set(id, entry);

    for (const key of FIELD_KEYS) {
      if (!fields[key]) errors.push(`${id}：缺少「${key}」`);
    }
    if (fields['状态'] && !STATUSES.includes(fields['状态'])) {
      errors.push(`${id}：状态「${fields['状态']}」只能是 draft 或 reviewed`);
    }
    if (fields['镜头'] && !presets.cameras.has(fields['镜头'])) {
      errors.push(`${id}：镜头「${fields['镜头']}」不在词表内`);
    }
    if (fields['场景'] && !presets.scenes.has(fields['场景'])) {
      errors.push(`${id}：场景「${fields['场景']}」不在字典内`);
    }
    if (fields['动作']) {
      if (/[。；;、]$/.test(fields['动作'])) errors.push(`${id}：动作结尾不要标点`);
      if (/标签|安全插图/.test(fields['动作'])) errors.push(`${id}：动作里不得出现「标签」或「安全插图」`);
    }

    const game = games.get(entry.gameId);
    if (!game) {
      errors.push(`${id}：找不到游戏 ${entry.gameId}`);
    } else {
      if (game.docId !== entry.chapter) {
        errors.push(`${id}：游戏 ${entry.gameId} 属于 ${game.docId}，却写在 ${entry.chapter}`);
      }
      if (fields['月龄'] && fields['月龄'] !== game.age) {
        errors.push(`${id}：月龄「${fields['月龄']}」与游戏数据「${game.age}」不一致`);
      }
      const allowed = fields['场景'] ? sceneOptions(game.place, presets) : null;
      if (allowed && !allowed.has(fields['场景'])) {
        warnings.push(
          `${id}：场景「${fields['场景']}」与场地「${game.place}」允许的场景不一致`,
        );
      }
    }

    if (fields['镜头'] && fields['场景'] && fields['动作'] && fields['月龄']) {
      const text = composePrompt(entry, presets);
      const head = text.split('避免：')[0];
      for (const word of BANNED) {
        if (head.includes(word)) errors.push(`${id}：画面描述出现禁画项「${word}」`);
      }
      if (text.length > MAX_PROMPT_LENGTH) {
        warnings.push(`${id}：拼接 ${text.length} 字，超过 ${MAX_PROMPT_LENGTH}`);
      }
    }

    const group = byGame.get(entry.gameId) ?? [];
    group.push(entry);
    byGame.set(entry.gameId, group);
  }

  for (const [gameId, group] of byGame) {
    if (group.length !== 4) {
      warnings.push(`${gameId}：应有 4 张步骤图，实际 ${group.length} 张`);
    }
    if (group.length > 1 && sameActions(group)) {
      warnings.push(`${gameId}：有重复的动作描述`);
    }
  }

  for (const key of assetKeys) {
    if (!seen.has(key)) errors.push(`${key}：有图片但缺少提示词`);
  }
  for (const key of seen.keys()) {
    if (!assetKeys.has(key)) errors.push(`${key}：有提示词但没有对应图片`);
  }

  const status = { total: entries.length, reviewed: 0, draft: 0 };
  for (const entry of entries) {
    if (entry.fields['状态'] === 'reviewed') status.reviewed += 1;
    else if (entry.fields['状态'] === 'draft') status.draft += 1;
  }

  return { errors, warnings, status };
}
