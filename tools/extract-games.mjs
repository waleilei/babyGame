import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCHEMA_VERSION = 1;
export const ABILITIES = ['大运动', '精细动作', '语言沟通', '认知探索', '社会情绪', '生活自理'];

export const SOURCE_FILES = [
  { file: 'manuscript/ch05-08.md', fallbackPartNo: 2 },
  { file: 'manuscript/ch09-12.md', fallbackPartNo: 2 },
  { file: 'manuscript/ch13-18.md', fallbackPartNo: 3 },
];

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_SOURCE_DIR = resolve(REPO_ROOT, '../books/0-3-game-book');
const CN_NUMBERS = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };

/**
 * @typedef {{ id: string, name: string, age: string, ageRange: { min: number, max: number },
 *   ability: string, duration: string, place: string, materials: string, people: string,
 *   play: string, steps: string[], observe: string[], up: string, down: string,
 *   safety: string, question: string, art: { main: string, panels: string[] } }} Game
 * @typedef {{ type: 'p'|'ul'|'ol'|'h3'|'h4', text?: string, items?: string[] }} IntroBlock
 * @typedef {{ schemaVersion: number, no: number, title: string, partNo: number, age: string,
 *   kind: 'games', intro: IntroBlock[], games: Game[] }} Chapter
 */

function padId(value) {
  return String(value).padStart(3, '0');
}

function trim(value) {
  return String(value ?? '').trim();
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

function parseBlocks(lines) {
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

function parseGame(lines, index) {
  const heading = /^###\s+(\d{2,3})\s+(.+?)\s*$/.exec(lines[index]);
  if (!heading) return null;

  const id = heading[1];
  const name = heading[2].trim();
  let info = null;
  const fields = {};

  for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
    const line = lines[cursor].trim();
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
    return { game: null, error: `${id} ${name} 信息条不足 6 段` };
  }

  const [age, ability, duration, place, materials, people] = info;
  const ageRange = parseAgeRange(age);
  const artId = padId(id);
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
      main: `assets/ill/${artId}.svg`,
      panels: [1, 2, 3, 4].map((n) => `assets/ill/panel/${artId}-${n}.svg`),
    },
  };

  if (!ageRange) {
    return { game, error: `${id} ${name} 月龄无法解析：${age}` };
  }

  return { game, error: null };
}

function parseChapterHeading(line) {
  const match = /^##\s*第(\d+)章\s+(.+?)\s*$/.exec(line);
  if (!match) return null;
  return { no: Number(match[1]), title: match[2].trim() };
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

export function loadSource({ sourceDir = DEFAULT_SOURCE_DIR, file, fallbackPartNo = 2 } = {}) {
  const fullPath = join(sourceDir, file);
  if (!existsSync(fullPath)) {
    const error = new Error(`源稿件不存在：${fullPath}`);
    error.code = 'ENOENT_SOURCE';
    throw error;
  }

  const lines = readFileSync(fullPath, 'utf8').split(/\r?\n/);
  let partNo = fallbackPartNo;
  let partTitle = '';

  for (const line of lines) {
    const partMatch = /^#\s*第([一二三四五六七八九十]+)篇\s*([^｜|]+)/.exec(line.trim());
    if (partMatch) {
      partNo = CN_NUMBERS[partMatch[1]] ?? fallbackPartNo;
      partTitle = partMatch[2].trim();
      break;
    }
  }

  const chapters = [];
  const errors = [];
  let current = null;
  let introLines = [];

  const finalizeChapter = () => {
    if (!current) return;
    const chapter = {
      schemaVersion: SCHEMA_VERSION,
      no: current.no,
      title: current.title,
      partNo,
      age: chapterAge(current.title, partNo),
      kind: 'games',
      intro: current.intro ?? parseBlocks(introLines),
      games: current.games,
    };
    chapters.push(chapter);
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const chapterHeading = parseChapterHeading(line.trim());
    if (chapterHeading) {
      finalizeChapter();
      current = { ...chapterHeading, games: [], intro: null };
      introLines = [];
      continue;
    }

    if (!current) continue;

    if (/^###\s+\d{2,3}\s+/.test(line.trim())) {
      if (current.intro === null) current.intro = parseBlocks(introLines);
      const parsed = parseGame(lines, index);
      if (parsed?.game) current.games.push(parsed.game);
      if (parsed?.error) errors.push(parsed.error);
      introLines = [];
      // `parseGame` scans ahead; skip game lines to keep intro collection clean.
      let cursor = index + 1;
      while (cursor < lines.length) {
        const next = lines[cursor].trim();
        if (next.startsWith('### ') || next.startsWith('## ')) break;
        cursor += 1;
      }
      index = cursor - 1;
      continue;
    }

    if (current.games.length === 0) introLines.push(line);
  }

  finalizeChapter();

  if (chapters.length === 0) {
    errors.push(`${file} 未解析到任何章节`);
  }
  if (!partTitle) {
    partTitle = partNo === 2 ? '分月龄游戏图鉴' : '把游戏放进生活';
  }

  return { partNo, partTitle, chapters, errors };
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

/**
 * 从稿件构建目录、章节与游戏数据，不写磁盘。
 * @param {{ sourceDir?: string, generatedAt?: string }} options
 */
export function buildDataset({ sourceDir = DEFAULT_SOURCE_DIR, generatedAt = generatedAtFor(sourceDir) } = {}) {
  const errors = [];
  const sourceResults = SOURCE_FILES.map((source) => {
    const result = loadSource({ sourceDir, ...source });
    errors.push(...result.errors);
    return result;
  });

  const partsByNo = new Map();
  const chapters = [];
  const games = [];

  for (const source of sourceResults) {
    if (!partsByNo.has(source.partNo)) {
      partsByNo.set(source.partNo, { no: source.partNo, title: source.partTitle, chapterNos: [] });
    }
    const part = partsByNo.get(source.partNo);
    for (const chapter of source.chapters) {
      if (partsByNo.get(chapter.partNo) && partsByNo.get(chapter.partNo) !== part) {
        errors.push(`第${chapter.no}章同时属于多个篇`);
      }
      chapter.partNo = source.partNo;
      chapter.age = chapterAge(chapter.title, chapter.partNo);
      part.chapterNos.push(chapter.no);
      chapters.push(chapter);
      games.push(...chapter.games);
    }
  }

  chapters.sort((a, b) => a.no - b.no);
  games.sort((a, b) => Number(a.id) - Number(b.id));
  const parts = [...partsByNo.values()].sort((a, b) => a.no - b.no);
  for (const part of parts) part.chapterNos.sort((a, b) => a - b);

  const book = readBookInfo(sourceDir);
  const toc = {
    schemaVersion: SCHEMA_VERSION,
    bookVersion: book.version,
    generatedAt,
    book: {
      title: book.title,
      subtitle: book.subtitle,
      total: games.length,
      chapterCount: chapters.length,
    },
    parts,
    chapters: chapters.map((chapter) => ({
      no: chapter.no,
      title: chapter.title,
      shortTitle: chapterShortTitle(chapter.title),
      age: chapter.age,
      count: chapter.games.length,
      file: `chapters/ch${String(chapter.no).padStart(2, '0')}.json`,
    })),
    gameIndex: games.map((game) => {
      const chapter = chapters.find((item) => item.games.includes(game));
      return {
        id: game.id,
        name: game.name,
        chapterNo: chapter ? chapter.no : 0,
        age: game.age,
        ability: game.ability,
      };
    }),
  };

  const artworkExists = (relativePath) => existsSync(join(sourceDir, relativePath));
  errors.push(...validateDataset({ toc, chapters, games, artworkExists }));

  return { toc, chapters, games, errors };
}

/**
 * 只读产物做硬校验。返回人类可读的错误列表，空数组表示通过。
 * @param {{ toc: any, chapters: any[], games: any[], artworkExists?: (path: string) => boolean }} dataset
 */
export function validateDataset({ toc, chapters, games, artworkExists = () => true }) {
  const errors = [];
  const requiredText = ['id', 'name', 'age', 'ability', 'duration', 'place', 'materials', 'people', 'play', 'up', 'down', 'safety', 'question'];

  if (toc.schemaVersion !== SCHEMA_VERSION) errors.push(`目录 schemaVersion 应为 ${SCHEMA_VERSION}`);
  if (!toc.book || toc.book.total !== 130) errors.push(`游戏总数应为 130，实际 ${toc.book?.total}`);
  if (toc.book?.chapterCount !== 14) errors.push(`章节数应为 14，实际 ${toc.book?.chapterCount}`);
  if (toc.chapters?.length !== 14) errors.push(`章列表应有 14 条，实际 ${toc.chapters?.length}`);
  if (toc.gameIndex?.length !== 130) errors.push(`目录索引应有 130 条，实际 ${toc.gameIndex?.length}`);
  if (toc.parts?.length !== 2) errors.push(`篇数应为 2，实际 ${toc.parts?.length}`);

  const expectedNos = Array.from({ length: 14 }, (_, index) => index + 5);
  const chapterNos = (toc.chapters ?? []).map((chapter) => chapter.no).sort((a, b) => a - b);
  if (chapterNos.join(',') !== expectedNos.join(',')) {
    errors.push(`章号应连续为 5-18，实际 ${chapterNos.join(',')}`);
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

  const expectedIds = Array.from({ length: 130 }, (_, index) => String(index + 1).padStart(2, '0'));
  const sortedIds = [...seenIds].sort((a, b) => Number(a) - Number(b));
  if (sortedIds.join(',') !== expectedIds.join(',')) {
    const missing = expectedIds.filter((id) => !seenIds.has(id));
    errors.push(`编号应连续覆盖 01-130，缺失：${missing.join(',') || '无'}`);
  }

  const chapterByNo = new Map(chapters.map((chapter) => [chapter.no, chapter]));
  for (const chapter of toc.chapters ?? []) {
    const data = chapterByNo.get(chapter.no);
    if (!data) {
      errors.push(`第${chapter.no}章数据缺失`);
      continue;
    }
    if (!chapter.title || !chapter.shortTitle || !chapter.age) errors.push(`第${chapter.no}章目录字段不完整`);
    if (chapter.count !== data.games.length) {
      errors.push(`第${chapter.no}章游戏数不一致：目录 ${chapter.count} / 数据 ${data.games.length}`);
    }
    if (!data.intro || data.intro.length === 0) errors.push(`第${chapter.no}章缺章首导语`);
  }

  const indexByKey = new Map((toc.gameIndex ?? []).map((entry) => [`${entry.chapterNo}:${entry.id}`, entry]));
  for (const chapter of chapters) {
    for (const game of chapter.games) {
      const entry = indexByKey.get(`${chapter.no}:${game.id}`);
      if (!entry) {
        errors.push(`目录索引缺少第${chapter.no}章 ${game.id}`);
        continue;
      }
      for (const field of ['name', 'age', 'ability']) {
        if (entry[field] !== game[field]) {
          errors.push(`第${chapter.no}章 ${game.id} 的 ${field} 与目录索引不一致`);
        }
      }
    }
  }

  for (const entry of toc.gameIndex ?? []) {
    if (!chapterByNo.has(entry.chapterNo)) errors.push(`索引 ${entry.id} 指向不存在的第${entry.chapterNo}章`);
    if (!ABILITIES.includes(entry.ability)) errors.push(`索引 ${entry.id} 能力非法：${entry.ability}`);
  }

  return [...new Set(errors)];
}

/**
 * 写出数据产物并复制引用到的插画。
 * @param {{ toc: any, chapters: any[], games: any[] }} dataset
 * @param {{ outDir: string, sourceDir: string }} options
 */
export function writeDataset(dataset, { outDir, sourceDir }) {
  mkdirSync(join(outDir, 'data/chapters'), { recursive: true });

  // 目录是首屏资源，压成单行以守住 20 KB 预算；章节数据保留缩进便于排查。
  writeFileSync(join(outDir, 'data/toc.json'), `${JSON.stringify(dataset.toc)}\n`);

  for (const chapter of dataset.chapters) {
    const file = join(outDir, 'data', `chapters/ch${String(chapter.no).padStart(2, '0')}.json`);
    writeFileSync(file, `${JSON.stringify(chapter, null, 2)}\n`);
  }

  let copied = 0;
  for (const game of dataset.games) {
    for (const relativePath of [game.art.main, ...game.art.panels]) {
      const source = join(sourceDir, relativePath);
      const target = join(outDir, relativePath);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(source, target);
      copied += 1;
    }
  }

  return { chapters: dataset.chapters.length, games: dataset.games.length, artwork: copied };
}

function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function main() {
  const sourceDir = process.env.BOOK_DIR ? resolve(process.env.BOOK_DIR) : DEFAULT_SOURCE_DIR;
  const startedAt = performance.now();

  console.log(`源目录  ${sourceDir}`);
  if (!existsSync(join(sourceDir, 'manuscript/ch05-08.md'))) {
    console.error(`✗ 找不到稿件目录，请设置 BOOK_DIR`);
    process.exit(2);
  }

  const dataset = buildDataset({ sourceDir });
  if (dataset.errors.length > 0) {
    for (const error of dataset.errors) console.error(`✗ ${error}`);
    console.error(`${dataset.errors.length} 个错误，未写出文件`);
    process.exit(1);
  }

  const result = writeDataset(dataset, { outDir: REPO_ROOT, sourceDir });
  const tocSize = statSync(join(REPO_ROOT, 'data/toc.json')).size;

  console.log(`读取    ${SOURCE_FILES.length} 个文件`);
  console.log(`解析    ${result.games} 条游戏 / ${result.chapters} 章 / ${dataset.toc.parts.length} 篇`);
  console.log(`校验    0 error`);
  console.log(`写出    data/toc.json ${formatBytes(tocSize)}`);
  console.log(`        data/chapters/ch05.json … ch18.json`);
  console.log(`插画    ${result.artwork} 个文件 → assets/ill`);
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
