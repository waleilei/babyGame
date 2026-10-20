import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCHEMA_VERSION = 2;
export const ABILITIES = ['大运动', '精细动作', '语言沟通', '认知探索', '社会情绪', '生活自理'];

/** 全书稿件：前置、四篇正文、附录；顺序即阅读顺序。 */
export const SOURCE_FILES = [
  { file: 'manuscript/front-matter.md', mode: 'front' },
  { file: 'manuscript/part1-ch01-02.md', mode: 'prose', partNo: 1 },
  { file: 'manuscript/part1-ch03-04.md', mode: 'prose', partNo: 1 },
  { file: 'manuscript/ch05-08.md', mode: 'games', partNo: 2 },
  { file: 'manuscript/ch09-12.md', mode: 'games', partNo: 2 },
  { file: 'manuscript/ch13-18.md', mode: 'games', partNo: 3 },
  { file: 'manuscript/part4-ch19-21.md', mode: 'prose', partNo: 4 },
  { file: 'manuscript/appendix.md', mode: 'appendix' },
];

/** 目录分组，顺序即全书顺序；分组标题是唯一来源。 */
export const GROUPS = [
  { id: 'front', title: '前置' },
  { id: 'part-1', no: 1, title: '会玩的孩子' },
  { id: 'part-2', no: 2, title: '分月龄游戏图鉴' },
  { id: 'part-3', no: 3, title: '把游戏放进生活' },
  { id: 'part-4', no: 4, title: '不同家庭的玩法' },
  { id: 'appendix', title: '附录' },
];

export const FRONT_ID = 'front';
export const FRONT_TITLE = '前置｜序、使用说明、发展地图';
export const FRONT_SHORT_TITLE = '序、使用说明、发展地图';
export const DOC_COUNT = 28;
export const CHAPTER_COUNT = 21;
export const GAME_COUNT = 130;

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_SOURCE_DIR = resolve(REPO_ROOT, '../books/0-3-game-book');
const CN_NUMBERS = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
const MAX_PSEUDO_HEADING = 40;
const DOC_FIELDS = ['id', 'no', 'kind', 'title', 'shortTitle', 'meta', 'count', 'file'];

/**
 * @typedef {{ type: 'p' | 'h2' | 'h3' | 'h4' | 'ul' | 'ol' | 'table' | 'quote' | 'checklist' | 'hr',
 *   text?: string, items?: any[], start?: number, head?: string[], rows?: string[][] }} Block
 * @typedef {{ id: string, no: number | null, kind: 'games' | 'prose', title: string, partId: string,
 *   meta: string, intro?: Block[], games?: any[], blocks?: Block[],
 *   sections?: { id: string, level: number, title: string }[] }} Doc
 */

function padId(value) {
  return String(value).padStart(3, '0');
}

function trim(value) {
  return String(value ?? '').trim();
}

export function chapterDocId(no) {
  return `ch${String(no).padStart(2, '0')}`;
}

export function appendixDocId(letter) {
  return `apx-${String(letter).toLowerCase()}`;
}

function chapterFile(no) {
  return `chapters/${chapterDocId(no)}.json`;
}

function unnumberedFile(id) {
  return `docs/${id}.json`;
}

function splitInfoLine(line) {
  const raw = line.replace(/^`/, '').replace(/`$/, '');
  return raw.split(/\s*·\s*/).map(trim);
}

function splitSteps(text) {
  return text
    .split(/[①②③④⑤⑥⑦⑧⑨]/)
    .map(trim)
    .filter(Boolean);
}

function splitObserve(text) {
  return text
    .split(/[；;]/)
    .map(trim)
    .filter(Boolean);
}

function parseAgeRange(age) {
  const match = /^(\d+)\s*-\s*(\d+)\s*月/.exec(age);
  if (!match) return null;
  return { min: Number(match[1]), max: Number(match[2]) };
}

function parseIntroBlocks(lines) {
  const blocks = [];
  let list = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line === '---' || line.startsWith('>')) continue;

    if (line.startsWith('- ')) {
      if (!list) {
        list = { type: 'ul', items: [] };
        blocks.push(list);
      }
      list.items.push(line.slice(2).trim());
      continue;
    }

    list = null;
    blocks.push({ type: 'p', text: line });
  }

  return blocks.filter((block) => block.type !== 'ul' || block.items.length > 0);
}

function parseGame(lines, index, docId, errors) {
  const heading = /^###\s+(\d{2,3})\s+(.+?)\s*$/.exec(lines[index].text.trim());
  if (!heading) return null;

  const id = heading[1];
  const name = heading[2].trim();
  let info = null;
  const fields = {};

  for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
    const line = lines[cursor].text.trim();
    if (!line) continue;
    if (line.startsWith('### ') || line.startsWith('## ') || line === '---') break;

    if (!info && /^`.+`$/.test(line)) {
      info = splitInfoLine(line);
      continue;
    }

    const upDown = /^\*\*进阶\*\*\s*[：:]\s*(.*?)\s*\*\*降阶\*\*\s*[：:]\s*(.*)$/.exec(line);
    if (upDown) {
      fields['进阶'] = upDown[1].trim();
      fields['降阶'] = upDown[2].trim();
      continue;
    }

    const fieldMatch = /^\*\*(玩|步骤|观察|进阶|降阶|安全|问)\*\*\s*[：:]\s*(.*)$/.exec(line);
    if (fieldMatch) {
      fields[fieldMatch[1]] = fieldMatch[2].trim();
    }
  }

  if (!info || info.length !== 6) {
    errors.push(`${docId} 第${lines[index].no}行：${id} ${name} 信息条不足 6 段`);
    return null;
  }

  const [age, ability, duration, place, materials, people] = info;
  const ageRange = parseAgeRange(age);
  const artId = padId(id);
  const panels = [1, 2, 3, 4].map((n) => `assets/art/panel_web/${artId}-${n}.jpg`);
  const game = {
    id,
    name,
    age,
    ageRange,
    ability,
    duration,
    place,
    materials,
    people,
    play: fields['玩'] ?? '',
    steps: splitSteps(fields['步骤'] ?? ''),
    observe: splitObserve(fields['观察'] ?? ''),
    up: fields['进阶'] ?? '',
    down: fields['降阶'] ?? '',
    safety: fields['安全'] ?? '',
    question: fields['问'] ?? '',
    art: {
      // web 版为 900×600 水彩步骤图，首张兼作卡片主图。
      main: panels[0],
      panels,
    },
  };

  if (!ageRange) {
    errors.push(`${docId} 第${lines[index].no}行：${id} ${name} 月龄无法解析：${age}`);
  }

  return game;
}

function parseChapterHeading(text) {
  const match = /^##\s*第(\d+)章\s+(.+?)\s*$/.exec(text);
  if (!match) return null;
  return { no: Number(match[1]), title: match[2].trim() };
}

function parseAppendixHeading(text) {
  const match = /^##\s*附录\s*([A-Fa-f])\s*(.*?)\s*$/.exec(text);
  if (!match) return null;
  return { letter: match[1].toUpperCase(), title: match[2].trim() };
}

function parsePartHeading(text) {
  const match = /^#\s*第([一二三四五六七八九十]+)篇\s*(.*?)\s*$/.exec(text);
  if (!match) return null;
  const title = match[2].split(/[｜|]/)[0].trim();
  return { no: CN_NUMBERS[match[1]] ?? null, title };
}

function chapterAge(title, partNo) {
  if (partNo !== 2) return '生活场景';
  const head = title.split(/[｜|]/)[0]?.trim() ?? '';
  return head.replace(/个月/g, '月');
}

function chapterShortTitle(title) {
  const parts = title.split(/[｜|]/).map(trim).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : title;
}

function stripBold(text) {
  return String(text ?? '').replace(/\*\*/g, '').trim();
}

/**
 * 独占一段且整段加粗的伪标题升级为 h4。
 * 条件：整行只有一个 `**…**`、内部不含 `*`、不以句末标点结尾、不超过 40 字。
 */
function pseudoHeading(text) {
  const match = /^\*\*([^*]+)\*\*$/.exec(String(text ?? '').trim());
  if (!match) return null;
  const inner = match[1].trim();
  if (!inner) return null;
  if (/[。！？；]$/.test(inner)) return null;
  if ([...inner].length > MAX_PSEUDO_HEADING) return null;
  return inner;
}

/** 行内标记只允许 `**粗体**`；其余 Markdown 一律报错。 */
function checkInline(text, docId, lineNo, errors, label = '文本') {
  const value = String(text ?? '');
  const fail = (reason) => errors.push(`${docId} 第${lineNo}行：${label}${reason}`);

  if (value.includes('`')) fail('包含代码标记（反引号）');
  if (/!\[[^\]]*\]\([^)]*\)/.test(value)) fail('包含图片标记');
  if (/\[[^\]]*\]\([^)]*\)/.test(value)) fail('包含链接标记');
  if (/<\/?[a-zA-Z][^>]*>/.test(value)) fail('包含原始 HTML');
  if (/_[^_\s][^_]*_/.test(value)) fail('包含斜体标记（下划线）');
  if (/\[[ xX]?\]/.test(value)) fail('残留字面清单标记 [ ]');

  for (const line of value.split('\n')) {
    const stars = (line.match(/\*/g) ?? []).length;
    if (stars === 0) continue;
    if (stars % 2 !== 0) {
      fail('粗体标记未闭合');
      continue;
    }
    if (line.replace(/\*\*/g, '').includes('*')) fail('包含不支持的单个星号');
  }
}

function splitTableRow(line) {
  let value = String(line).trim();
  if (value.startsWith('|')) value = value.slice(1);
  if (value.endsWith('|')) value = value.slice(0, -1);
  return value.split('|').map((cell) => cell.trim());
}

function isSeparatorRow(cells) {
  return cells.length > 0 && cells.every((cell) => /^:?-{2,}:?$/.test(cell));
}

function parseProseBlocks(lines, { docId, errors }) {
  const blocks = [];
  /** @type {{ type: string, no: number, lines?: string[], items?: string[], start?: number, rows?: string[][] }} */
  let active = null;

  function flush() {
    if (!active) return;
    const current = active;
    active = null;

    if (current.type === 'p') {
      const text = current.lines.join('\n');
      checkInline(text, docId, current.no, errors, '段落');
      const heading = pseudoHeading(text);
      if (heading) {
        blocks.push({ type: 'h4', text: heading });
      } else {
        blocks.push({ type: 'p', text });
      }
      return;
    }

    if (current.type === 'quote') {
      for (const line of current.lines) checkInline(line, docId, current.no, errors, '引用');
      blocks.push({ type: 'quote', text: current.lines.join('\n') });
      return;
    }

    if (current.type === 'ul' || current.type === 'ol') {
      for (const item of current.items) checkInline(item, docId, current.no, errors, '列表项');
      if (current.type === 'ul') {
        blocks.push({ type: 'ul', items: [...current.items] });
      } else {
        blocks.push({ type: 'ol', start: current.start, items: [...current.items] });
      }
      return;
    }

    if (current.type === 'checklist') {
      const items = current.items.map(({ text, checked }) => {
        if (!text) errors.push(`${docId} 第${current.no}行：清单项为空`);
        checkInline(text, docId, current.no, errors, '清单项');
        return { text, checked };
      });
      blocks.push({ type: 'checklist', items });
      return;
    }

    if (current.type === 'table') {
      const [headRow, ...rest] = current.rows;
      if (!headRow || headRow.length === 0) {
        errors.push(`${docId} 第${current.no}行：表头为空`);
        return;
      }
      if (rest.length === 0 || !isSeparatorRow(rest[0])) {
        errors.push(`${docId} 第${current.no}行：表格第二行应为分隔行`);
        return;
      }
      const body = rest.slice(1);
      headRow.forEach((cell, index) => checkInline(cell, docId, current.no, errors, `表头第${index + 1}列`));
      const rows = body.map((cells, rowIndex) => {
        if (cells.length !== headRow.length) {
          errors.push(
            `${docId} 第${current.no}行：表格列数不一致（表头 ${headRow.length} 列，第 ${rowIndex + 1} 行 ${cells.length} 列）`,
          );
        }
        cells.forEach((cell, index) => checkInline(cell, docId, current.no, errors, `表格第${rowIndex + 1}行第${index + 1}列`));
        return cells;
      });
      blocks.push({ type: 'table', head: [...headRow], rows });
    }
  }

  for (const line of lines) {
    const text = line.text.trim();

    if (!text || text === '---') {
      flush();
      continue;
    }

    if (text.startsWith('#### ') || text.startsWith('### ') || text.startsWith('## ')) {
      flush();
      const level = text.startsWith('#### ') ? 'h4' : text.startsWith('### ') ? 'h3' : 'h2';
      const content = text.slice(level === 'h4' ? 4 : level === 'h3' ? 3 : 2).trim();
      if (!content) {
        errors.push(`${docId} 第${line.no}行：标题为空`);
        continue;
      }
      checkInline(content, docId, line.no, errors, '标题');
      blocks.push({ type: level, text: content });
      continue;
    }

    if (text.startsWith('>')) {
      if (active?.type !== 'quote') {
        flush();
        active = { type: 'quote', no: line.no, lines: [] };
      }
      active.lines.push(text.replace(/^>\s?/, '').trim());
      continue;
    }

    const checklist = /^-\s+\[([ xX])\]\s*(.*)$/.exec(text);
    if (checklist) {
      if (active?.type !== 'checklist') {
        flush();
        active = { type: 'checklist', no: line.no, items: [] };
      }
      active.items.push({ text: checklist[2].trim(), checked: checklist[1].toLowerCase() === 'x' });
      continue;
    }

    if (/^-\s+/.test(text)) {
      if (active?.type !== 'ul') {
        flush();
        active = { type: 'ul', no: line.no, items: [] };
      }
      active.items.push(text.replace(/^-\s+/, '').trim());
      continue;
    }

    const ordered = /^(\d+)\.\s+(.*)$/.exec(text);
    if (ordered) {
      const number = Number(ordered[1]);
      if (active?.type !== 'ol' || active.start + active.items.length !== number) {
        flush();
        active = { type: 'ol', no: line.no, start: number, items: [] };
      }
      active.items.push(ordered[2].trim());
      continue;
    }

    if (text.startsWith('|')) {
      if (active?.type !== 'table') {
        flush();
        active = { type: 'table', no: line.no, rows: [] };
      }
      active.rows.push(splitTableRow(text));
      continue;
    }

    if (active?.type !== 'p') {
      flush();
      active = { type: 'p', no: line.no, lines: [] };
    }
    active.lines.push(text);
  }

  flush();
  return blocks;
}

export function sectionsFromBlocks(blocks) {
  const sections = [];
  for (const block of blocks) {
    if (block.type !== 'h2' && block.type !== 'h3' && block.type !== 'h4') continue;
    sections.push({
      id: `s${sections.length + 1}`,
      level: Number(block.type.slice(1)),
      title: stripBold(block.text),
    });
  }
  return sections;
}

function readLines(fullPath) {
  return readFileSync(fullPath, 'utf8')
    .split(/\r?\n/)
    .map((text, index) => ({ text, no: index + 1 }));
}

function loadProseSource({ fullPath, file, mode, partNo: fallbackPartNo, errors }) {
  const lines = readLines(fullPath);
  const docs = [];
  let partNo = fallbackPartNo ?? null;
  let current = null;
  let prelude = [];

  const partIdFor = (no) => (mode === 'front' ? 'front' : mode === 'appendix' ? 'appendix' : `part-${no}`);
  const metaFor = () => (mode === 'appendix' ? '附录' : '阅读');

  const start = (doc) => {
    current = { ...doc, lines: [...prelude] };
    prelude = [];
  };

  const finish = () => {
    if (!current) return;
    const docId = current.id;
    const blocks = parseProseBlocks(current.lines, { docId, errors });
    docs.push({
      schemaVersion: SCHEMA_VERSION,
      id: docId,
      no: current.no ?? null,
      kind: 'prose',
      title: current.title,
      partId: current.partId,
      meta: metaFor(),
      blocks,
      sections: sectionsFromBlocks(blocks),
    });
    current = null;
  };

  for (const line of lines) {
    const text = line.text.trim();

    const part = parsePartHeading(text);
    if (part) {
      finish();
      partNo = part.no ?? partNo;
      prelude = [];
      continue;
    }

    if (text.startsWith('# ')) {
      // 分篇标题只用于分组；其后若还有内容，继续归入当前文档。
      continue;
    }

    if (mode === 'front') {
      const heading = /^##\s+(.+)$/.exec(text);
      if (heading) {
        if (!current) {
          start({ id: FRONT_ID, no: null, partId: 'front', title: FRONT_TITLE });
        }
        current.lines.push(line);
        continue;
      }
      (current ? current.lines : prelude).push(line);
      continue;
    }

    const chapter = parseChapterHeading(text);
    if (chapter) {
      finish();
      start({
        id: chapterDocId(chapter.no),
        no: chapter.no,
        partId: partIdFor(partNo),
        title: chapter.title,
      });
      continue;
    }

    const appendix = parseAppendixHeading(text);
    if (appendix) {
      finish();
      start({
        id: appendixDocId(appendix.letter),
        no: null,
        partId: 'appendix',
        title: `附录${appendix.letter} ${appendix.title}`.trim(),
      });
      continue;
    }

    if (current) current.lines.push(line);
    else prelude.push(line);
  }

  finish();

  if (docs.length === 0 && prelude.some((line) => line.text.trim() && line.text.trim() !== '---')) {
    errors.push(`${file} 未解析出任何文档`);
  }

  return { docs, partNo };
}

function loadGamesSource({ fullPath, file, partNo: fallbackPartNo, errors }) {
  const lines = readLines(fullPath);
  let partNo = fallbackPartNo;
  let partTitle = '';
  const docs = [];

  for (const line of lines) {
    const part = parsePartHeading(line.text.trim());
    if (part) {
      partNo = part.no ?? partNo;
      partTitle = part.title;
      break;
    }
  }

  let current = null;
  let introLines = [];

  const finish = () => {
    if (!current) return;
    const docId = chapterDocId(current.no);
    docs.push({
      schemaVersion: SCHEMA_VERSION,
      id: docId,
      no: current.no,
      kind: 'games',
      title: current.title,
      partId: `part-${partNo}`,
      meta: chapterAge(current.title, partNo),
      intro: current.intro ?? parseIntroBlocks(introLines),
      games: current.games,
    });
  };

  for (let index = 0; index < lines.length; index += 1) {
    const text = lines[index].text;
    const chapter = parseChapterHeading(text.trim());
    if (chapter) {
      finish();
      current = { ...chapter, games: [] };
      introLines = [];
      continue;
    }

    if (!current) continue;

    if (/^###\s+\d{2,3}\s+/.test(text.trim())) {
      if (current.games.length === 0) current.intro = parseIntroBlocks(introLines);
      const docId = chapterDocId(current.no);
      const game = parseGame(lines, index, docId, errors);
      if (game) current.games.push(game);
      introLines = [];
      let cursor = index + 1;
      while (cursor < lines.length) {
        const next = lines[cursor].text.trim();
        if (next.startsWith('### ') || next.startsWith('## ')) break;
        cursor += 1;
      }
      index = cursor - 1;
      continue;
    }

    if (current.games.length === 0) introLines.push(text);
  }

  finish();

  if (docs.length === 0) errors.push(`${file} 未解析到任何章节`);
  return { docs, partNo, partTitle };
}

export function loadSource({ sourceDir = DEFAULT_SOURCE_DIR, file, mode = 'games', partNo = 2 } = {}) {
  const fullPath = join(sourceDir, file);
  if (!existsSync(fullPath)) {
    const error = new Error(`源稿件不存在：${fullPath}`);
    error.code = 'ENOENT_SOURCE';
    throw error;
  }

  const errors = [];
  const result = mode === 'games'
    ? loadGamesSource({ fullPath, file, partNo, errors })
    : loadProseSource({ fullPath, file, mode, partNo, errors });

  return { mode, partNo: result.partNo, partTitle: result.partTitle ?? '', docs: result.docs, errors };
}

export function readBookInfo(sourceDir = DEFAULT_SOURCE_DIR) {
  const outlinePath = join(sourceDir, 'outline.md');
  const fallback = {
    title: '0-3岁亲子游戏图鉴',
    subtitle: '130个游戏，把日常变成早教',
    version: 'v1.4',
  };
  if (!existsSync(outlinePath)) return fallback;

  const text = readFileSync(outlinePath, 'utf8');
  const title = /^\|\s*书名\s*\|\s*《(.+?)》\s*\|/m.exec(text)?.[1]?.trim();
  const subtitle = /^\|\s*副标题\s*\|\s*(.+?)\s*\|/m.exec(text)?.[1]?.trim();
  const version = /^>\s*版本\s+(v[\d.]+)/m.exec(text)?.[1]?.trim();

  return {
    title: title || fallback.title,
    subtitle: subtitle || fallback.subtitle,
    version: version || fallback.version,
  };
}

function generatedAtFor(sourceDir) {
  const times = SOURCE_FILES.map(({ file }) => join(sourceDir, file))
    .filter((path) => existsSync(path))
    .map((path) => statSync(path).mtimeMs);
  const outline = join(sourceDir, 'outline.md');
  if (existsSync(outline)) times.push(statSync(outline).mtimeMs);
  return new Date(times.length > 0 ? Math.max(...times) : Date.now()).toISOString();
}

export function expectedDocIds() {
  return [
    FRONT_ID,
    ...Array.from({ length: CHAPTER_COUNT }, (_, index) => chapterDocId(index + 1)),
    ...Array.from({ length: 6 }, (_, index) => appendixDocId(String.fromCharCode(97 + index))),
  ];
}

function docShortTitle(doc) {
  if (doc.id === FRONT_ID) return FRONT_SHORT_TITLE;
  if (doc.partId === 'appendix') return doc.title.replace(/^附录[A-F]\s*/, '').trim();
  return chapterShortTitle(doc.title);
}

function docFile(doc) {
  return doc.no === null || doc.no === undefined ? unnumberedFile(doc.id) : chapterFile(doc.no);
}

function tocGroupDocIds(docs, group) {
  if (group.id === 'front') return docs.filter((doc) => doc.id === FRONT_ID).map((doc) => doc.id);
  return docs.filter((doc) => doc.partId === group.id).map((doc) => doc.id);
}

/**
 * 从稿件构建目录与 28 个文档，不写磁盘。
 * @param {{ sourceDir?: string, generatedAt?: string }} options
 */
export function buildDataset({ sourceDir = DEFAULT_SOURCE_DIR, generatedAt = generatedAtFor(sourceDir) } = {}) {
  const errors = [];
  const docs = [];
  const partTitles = new Map();

  for (const source of SOURCE_FILES) {
    const result = loadSource({ sourceDir, ...source });
    errors.push(...result.errors);
    docs.push(...result.docs);
    if (result.partNo && result.partTitle) partTitles.set(`part-${result.partNo}`, result.partTitle);
  }

  const byId = new Map();
  for (const doc of docs) {
    if (byId.has(doc.id)) errors.push(`${doc.id} 文档 id 重复`);
    byId.set(doc.id, doc);
  }

  const expected = expectedDocIds();
  for (const id of expected) {
    if (!byId.has(id)) errors.push(`缺少文档 ${id}`);
  }
  for (const doc of docs) {
    if (!expected.includes(doc.id)) errors.push(`未知文档 ${doc.id}`);
  }

  for (const group of GROUPS) {
    if (!group.no) continue;
    const title = partTitles.get(group.id);
    if (title && title !== group.title) {
      errors.push(`${group.id} 篇名应为「${group.title}」，稿件为「${title}」`);
    }
  }

  const ordered = expected.map((id) => byId.get(id)).filter(Boolean);

  for (const doc of ordered) {
    if (doc.kind === 'games' && !/^ch(0[5-9]|1[0-8])$/.test(doc.id)) {
      errors.push(`${doc.id} 只有第 5-18 章可以是游戏章`);
    }
    if (doc.kind !== 'games' && /^ch(0[5-9]|1[0-8])$/.test(doc.id)) {
      errors.push(`${doc.id} 必须是游戏章`);
    }
    if (!doc.title) errors.push(`${doc.id} 缺少标题`);
    if (doc.kind === 'prose' && (!Array.isArray(doc.blocks) || doc.blocks.length === 0)) {
      errors.push(`${doc.id} 没有正文块`);
    }
  }

  const games = ordered.flatMap((doc) => doc.games ?? []);

  const toc = {
    schemaVersion: SCHEMA_VERSION,
    bookVersion: readBookInfo(sourceDir).version,
    generatedAt,
    book: {
      title: readBookInfo(sourceDir).title,
      subtitle: readBookInfo(sourceDir).subtitle,
      total: games.length,
      chapterCount: ordered.filter((doc) => doc.no !== null).length,
      docCount: ordered.length,
    },
    groups: GROUPS.map((group) => ({
      id: group.id,
      ...(group.no ? { no: group.no } : {}),
      title: group.title,
      docIds: tocGroupDocIds(ordered, group),
    })),
    docs: ordered.map((doc) => ({
      id: doc.id,
      no: doc.no ?? null,
      kind: doc.kind,
      title: doc.title,
      shortTitle: docShortTitle(doc),
      meta: doc.meta,
      count: doc.kind === 'games' ? doc.games.length : 0,
      file: docFile(doc),
    })),
    gameIndex: games.map((game) => {
      const doc = ordered.find((item) => (item.games ?? []).includes(game));
      return {
        id: game.id,
        name: game.name,
        docId: doc ? doc.id : '',
        chapterNo: doc ? doc.no : 0,
        age: game.age,
        ability: game.ability,
      };
    }),
  };

  const artworkExists = (relativePath) => existsSync(join(sourceDir, relativePath));
  errors.push(...validateDataset({ toc, docs: ordered, games, artworkExists }));

  return { toc, docs: ordered, games, errors };
}

const BLOCK_TYPES = new Set(['p', 'h2', 'h3', 'h4', 'ul', 'ol', 'table', 'quote', 'checklist', 'hr']);

export function validateBlocks(blocks, docId) {
  const errors = [];
  blocks.forEach((block, index) => {
    const at = `${docId} 第 ${index + 1} 块`;
    if (!block || !BLOCK_TYPES.has(block.type)) {
      errors.push(`${at}：未知块类型 ${block?.type}`);
      return;
    }
    if (block.type === 'p' || block.type === 'h2' || block.type === 'h3' || block.type === 'h4' || block.type === 'quote') {
      if (typeof block.text !== 'string' || block.text.trim() === '') errors.push(`${at}：文本为空`);
    }
    if (block.type === 'ul') {
      if (!Array.isArray(block.items) || block.items.length === 0) errors.push(`${at}：列表为空`);
      else if (block.items.some((item) => typeof item !== 'string' || item.trim() === '')) errors.push(`${at}：列表项为空`);
    }
    if (block.type === 'ol') {
      if (!Number.isInteger(block.start) || block.start <= 0) errors.push(`${at}：有序列表 start 非法`);
      if (!Array.isArray(block.items) || block.items.length === 0) errors.push(`${at}：有序列表为空`);
      else if (block.items.some((item) => typeof item !== 'string' || item.trim() === '')) errors.push(`${at}：有序列表项为空`);
    }
    if (block.type === 'table') {
      if (!Array.isArray(block.head) || block.head.length === 0) errors.push(`${at}：表头为空`);
      if (!Array.isArray(block.rows)) {
        errors.push(`${at}：表格缺少 rows`);
      } else {
        block.rows.forEach((row, rowIndex) => {
          if (!Array.isArray(row) || row.length !== block.head.length) {
            errors.push(`${at}：表格列数不一致（表头 ${block.head.length} 列，第 ${rowIndex + 1} 行 ${row?.length ?? 0} 列）`);
          }
        });
      }
    }
    if (block.type === 'checklist') {
      if (!Array.isArray(block.items) || block.items.length === 0) errors.push(`${at}：清单为空`);
      else if (block.items.some((item) => !item || typeof item.text !== 'string' || item.text.trim() === '')) {
        errors.push(`${at}：清单项为空`);
      }
    }
  });

  const sections = sectionsFromBlocks(blocks);
  const headings = blocks.filter((block) => block.type === 'h2' || block.type === 'h3' || block.type === 'h4').length;
  if (sections.length !== headings) errors.push(`${docId}：小节数与标题块不一致`);
  return errors;
}

export function validateDoc(doc) {
  const errors = [];
  if (!doc || doc.schemaVersion !== SCHEMA_VERSION) {
    return [`${doc?.id ?? '未知文档'}：schemaVersion 应为 ${SCHEMA_VERSION}`];
  }
  if (!['games', 'prose'].includes(doc.kind)) errors.push(`${doc.id}：kind 非法 ${doc.kind}`);
  if (!doc.title) errors.push(`${doc.id}：标题为空`);
  if (!doc.partId) errors.push(`${doc.id}：缺少 partId`);

  if (doc.kind === 'games') {
    if (!Array.isArray(doc.intro) || doc.intro.length === 0) errors.push(`${doc.id}：缺章首导语`);
    if (!Array.isArray(doc.games)) {
      errors.push(`${doc.id}：games 不是数组`);
      return errors;
    }
    if (doc.blocks) errors.push(`${doc.id}：游戏章不应有 blocks`);
    if (doc.games.some((game) => game?.id === undefined)) errors.push(`${doc.id}：游戏缺少 id`);
  } else if (doc.kind === 'prose') {
    if (!Array.isArray(doc.blocks) || doc.blocks.length === 0) {
      errors.push(`${doc.id}：没有正文块`);
    } else {
      errors.push(...validateBlocks(doc.blocks, doc.id));
      const expectedSections = sectionsFromBlocks(doc.blocks);
      if (!Array.isArray(doc.sections) || doc.sections.length !== expectedSections.length) {
        errors.push(`${doc.id}：sections 与标题块数量不一致`);
      }
    }
    if (doc.games) errors.push(`${doc.id}：文字章不应有 games`);
  }

  return errors;
}

/**
 * 只读产物做硬校验。返回人类可读的错误列表，空数组表示通过。
 * @param {{ toc: any, docs: any[], games: any[], artworkExists?: (path: string) => boolean }} dataset
 */
export function validateDataset({ toc, docs, games, artworkExists = () => true }) {
  const errors = [];
  const requiredText = ['id', 'name', 'age', 'ability', 'duration', 'place', 'materials', 'people', 'play', 'up', 'down', 'safety', 'question'];

  if (toc.schemaVersion !== SCHEMA_VERSION) errors.push(`目录 schemaVersion 应为 ${SCHEMA_VERSION}`);
  if (!toc.book || toc.book.total !== GAME_COUNT) errors.push(`游戏总数应为 ${GAME_COUNT}，实际 ${toc.book?.total}`);
  if (toc.book?.chapterCount !== CHAPTER_COUNT) errors.push(`章节数应为 ${CHAPTER_COUNT}，实际 ${toc.book?.chapterCount}`);
  if (toc.book?.docCount !== DOC_COUNT) errors.push(`文档数应为 ${DOC_COUNT}，实际 ${toc.book?.docCount}`);
  if (toc.docs?.length !== DOC_COUNT) errors.push(`docs 应有 ${DOC_COUNT} 条，实际 ${toc.docs?.length}`);
  if (toc.gameIndex?.length !== GAME_COUNT) errors.push(`目录索引应有 ${GAME_COUNT} 条，实际 ${toc.gameIndex?.length}`);
  if (toc.groups?.length !== GROUPS.length) errors.push(`分组应为 ${GROUPS.length} 个，实际 ${toc.groups?.length}`);

  const expected = expectedDocIds();
  const ids = (toc.docs ?? []).map((doc) => doc.id);
  if (ids.join(',') !== expected.join(',')) {
    errors.push(`docs 顺序应为 ${expected.join(',')}`);
  }

  const covered = (toc.groups ?? []).flatMap((group) => group.docIds ?? []);
  if (covered.join(',') !== ids.join(',')) {
    errors.push('分组顺序与 docs 顺序不一致，或未恰好覆盖每个文档一次');
  }

  const expectedDocKeys = [...DOC_FIELDS].sort().join(',');
  for (const doc of toc.docs ?? []) {
    const actualKeys = Object.keys(doc).sort().join(',');
    if (actualKeys !== expectedDocKeys) {
      errors.push(`${doc.id ?? '未知文档'}：目录字段应恰好为 ${DOC_FIELDS.join('/')}，实际 ${Object.keys(doc).join('/')}`);
    }
    if (!doc.id || !doc.kind || !doc.title || !doc.shortTitle || !doc.meta || !doc.file) {
      errors.push(`${doc.id ?? '未知文档'}：目录字段不完整`);
    }
    if (doc.kind === 'games' && doc.count <= 0) errors.push(`${doc.id}：游戏章应有游戏`);
    if (doc.kind === 'prose' && doc.count !== 0) errors.push(`${doc.id}：文字章不应有游戏`);
  }

  const docsById = new Map(docs.map((doc) => [doc.id, doc]));
  for (const doc of docs) {
    if ((doc.games?.length ?? 0) > 0 && !/^ch(0[5-9]|1[0-8])$/.test(doc.id)) {
      errors.push(`${doc.id}：游戏必须位于第 5-18 章`);
    }
  }
  for (const entry of toc.docs ?? []) {
    const data = docsById.get(entry.id);
    if (!data) {
      errors.push(`${entry.id}：文档数据缺失`);
      continue;
    }
    if (data.no !== entry.no) errors.push(`${entry.id}：文档 no 与目录不一致`);
    if (data.kind !== entry.kind) errors.push(`${entry.id}：文档 kind 与目录不一致`);
    if (data.title !== entry.title) errors.push(`${entry.id}：文档 title 与目录不一致`);
    if ((data.games?.length ?? 0) !== entry.count) {
      errors.push(`${entry.id}：游戏数不一致（目录 ${entry.count} / 数据 ${data.games?.length ?? 0}）`);
    }
    errors.push(...validateDoc(data));
  }

  const seenIds = new Set();
  for (const game of games) {
    const label = `${game.id} ${game.name}`;
    if (seenIds.has(game.id)) errors.push(`${label} 编号重复`);
    seenIds.add(game.id);

    for (const field of requiredText) {
      if (!game[field]) errors.push(`${label} 缺少 ${field}`);
    }
    if (!ABILITIES.includes(game.ability)) errors.push(`${label} 能力非法：${game.ability}`);
    if (!game.ageRange || !Number.isFinite(game.ageRange.min) || !Number.isFinite(game.ageRange.max) || game.ageRange.min >= game.ageRange.max) {
      errors.push(`${label} 月龄区间非法`);
    }
    if (!Array.isArray(game.steps) || game.steps.length !== 4) {
      errors.push(`${label} 步骤应为 4 条，实际 ${game.steps?.length ?? 0}`);
    }
    if (!Array.isArray(game.observe) || game.observe.length < 2 || game.observe.length > 3) {
      errors.push(`${label} 观察应为 2-3 条，实际 ${game.observe?.length ?? 0}`);
    }
    if (!game.art?.main || !Array.isArray(game.art?.panels) || game.art.panels.length !== 4) {
      errors.push(`${label} 插画字段不完整`);
    } else {
      if (!artworkExists(game.art.main)) errors.push(`${label} 缺主图 ${game.art.main}`);
      for (const panel of game.art.panels) {
        if (!artworkExists(panel)) errors.push(`${label} 缺步骤图 ${panel}`);
      }
    }
  }

  const expectedIds = Array.from({ length: GAME_COUNT }, (_, index) => String(index + 1).padStart(2, '0'));
  const sortedIds = [...seenIds].sort((a, b) => Number(a) - Number(b));
  if (sortedIds.join(',') !== expectedIds.join(',')) {
    const missing = expectedIds.filter((id) => !seenIds.has(id));
    errors.push(`编号应连续覆盖 01-130，缺失：${missing.join(',') || '无'}`);
  }

  const chapterByNo = new Map(docs.map((doc) => [doc.no, doc]));
  for (const entry of toc.docs ?? []) {
    const data = docsById.get(entry.id);
    if (!data) continue;
    if (entry.kind === 'games' && !chapterByNo.has(entry.no)) errors.push(`${entry.id}：章号缺失`);
  }

  const indexByKey = new Map((toc.gameIndex ?? []).map((entry) => [`${entry.docId}:${entry.id}`, entry]));
  for (const doc of docs) {
    for (const game of doc.games ?? []) {
      const entry = indexByKey.get(`${doc.id}:${game.id}`);
      if (!entry) {
        errors.push(`目录索引缺少 ${doc.id} ${game.id}`);
        continue;
      }
      for (const field of ['name', 'age', 'ability']) {
        if (entry[field] !== game[field]) {
          errors.push(`${doc.id} ${game.id} 的 ${field} 与目录索引不一致`);
        }
      }
      if (entry.chapterNo !== doc.no) errors.push(`${doc.id} ${game.id} 的章号与目录索引不一致`);
    }
  }

  for (const entry of toc.gameIndex ?? []) {
    if (!docsById.has(entry.docId)) errors.push(`索引 ${entry.id} 指向不存在的文档 ${entry.docId}`);
    if (!ABILITIES.includes(entry.ability)) errors.push(`索引 ${entry.id} 能力非法：${entry.ability}`);
  }

  return [...new Set(errors)];
}

/**
 * 写出数据产物并复制引用到的插画；清理不再被目录引用的旧文件。
 * @param {{ toc: any, docs: any[], games: any[] }} dataset
 * @param {{ outDir: string, sourceDir: string }} options
 */
export function writeDataset(dataset, { outDir, sourceDir }) {
  mkdirSync(join(outDir, 'data/chapters'), { recursive: true });
  mkdirSync(join(outDir, 'data/docs'), { recursive: true });

  // 目录是首屏资源，压成单行以守住 20 KB 预算；文档数据保留缩进便于排查。
  writeFileSync(join(outDir, 'data/toc.json'), `${JSON.stringify(dataset.toc)}\n`);

  const written = new Map();
  for (const doc of dataset.docs) {
    const relative = dataset.toc.docs.find((entry) => entry.id === doc.id)?.file;
    if (!relative) continue;
    const target = join(outDir, 'data', relative);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, `${JSON.stringify(doc, null, 2)}\n`);
    written.set(relative, true);
  }

  for (const dir of ['chapters', 'docs']) {
    const full = join(outDir, 'data', dir);
    if (!existsSync(full)) continue;
    for (const name of readdirSync(full)) {
      if (!name.endsWith('.json')) continue;
      if (written.has(`${dir}/${name}`)) continue;
      unlinkSync(join(full, name));
    }
  }

  let copied = 0;
  for (const game of dataset.games) {
    for (const relativePath of new Set([game.art.main, ...game.art.panels])) {
      const source = join(sourceDir, relativePath);
      const target = join(outDir, relativePath);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(source, target);
      copied += 1;
    }
  }

  return { docs: dataset.docs.length, games: dataset.games.length, artwork: copied };
}

function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function main() {
  const sourceDir = process.env.BOOK_DIR ? resolve(process.env.BOOK_DIR) : DEFAULT_SOURCE_DIR;
  const startedAt = performance.now();

  console.log(`源目录  ${sourceDir}`);
  if (!existsSync(join(sourceDir, 'manuscript/front-matter.md'))) {
    console.error('✗ 找不到稿件目录，请设置 BOOK_DIR');
    process.exit(2);
  }

  let dataset;
  try {
    dataset = buildDataset({ sourceDir });
  } catch (error) {
    console.error(`✗ ${error.message}`);
    process.exit(error.code === 'ENOENT_SOURCE' ? 2 : 1);
  }

  if (dataset.errors.length > 0) {
    for (const error of dataset.errors) console.error(`✗ ${error}`);
    console.error(`${dataset.errors.length} 个错误，未写出文件`);
    process.exit(1);
  }

  const result = writeDataset(dataset, { outDir: REPO_ROOT, sourceDir });
  const tocSize = statSync(join(REPO_ROOT, 'data/toc.json')).size;

  console.log(`读取    ${SOURCE_FILES.length} 个文件`);
  console.log(`解析    ${result.docs} 个文档 / ${result.games} 条游戏 / ${GROUPS.length} 个分组`);
  console.log(`校验    0 error`);
  console.log(`写出    data/toc.json ${formatBytes(tocSize)}`);
  console.log('        data/chapters/ch01.json … ch21.json');
  console.log('        data/docs/front.json、apx-a.json … apx-f.json');
  console.log(`插画    ${result.artwork} 张步骤图 → assets/art/panel_web`);
  console.log(`耗时    ${((performance.now() - startedAt) / 1000).toFixed(2)}s`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`✗ ${error.message}`);
    process.exit(error.code === 'ENOENT_SOURCE' ? 2 : 1);
  }
}
