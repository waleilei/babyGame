import test from 'node:test';
import assert from 'node:assert/strict';

import { buildHash, parseHash, normalizeGameId } from '../src/core/router.js';
import { resolveRoute } from '../src/domain/route.js';
import { groupChaptersByPart, searchGames, selectNeighbors } from '../src/domain/catalog.js';
import { chapterHeading, resultCountLabel } from '../src/domain/format.js';
import { selectChapterView, selectTocView } from '../src/state/selectors.js';

const chapterRecord = (no, title, shortTitle, age) => ({
  no,
  title,
  shortTitle,
  age,
  count: 1,
  file: `chapters/ch${String(no).padStart(2, '0')}.json`,
});

const TOC = {
  schemaVersion: 1,
  bookVersion: 'v1.4',
  book: {
    title: '0-3岁亲子游戏图鉴',
    subtitle: '130个游戏，把日常变成早教',
    total: 130,
    chapterCount: 14,
  },
  parts: [
    { no: 2, title: '分月龄游戏图鉴', chapterNos: [5, 6, 7, 8, 9, 10, 11, 12] },
    { no: 3, title: '把游戏放进生活', chapterNos: [13, 14, 15, 16, 17, 18] },
  ],
  chapters: [
    chapterRecord(5, '0-3个月｜躺着的世界', '躺着的世界', '0-3月'),
    chapterRecord(6, '4-6个月｜翻身与抓握', '翻身与抓握', '4-6月'),
    chapterRecord(7, '7-9个月｜坐起来，够世界', '坐起来，够世界', '7-9月'),
    chapterRecord(8, '10-12个月｜爬、站、走', '爬、站、走', '10-12月'),
    chapterRecord(9, '13-18个月｜行走与探索', '行走与探索', '13-18月'),
    chapterRecord(10, '19-24个月｜语言爆发与“我自己来”', '语言爆发与“我自己来”', '19-24月'),
    chapterRecord(11, '25-30个月｜假装游戏与规则萌芽', '假装游戏与规则萌芽', '25-30月'),
    chapterRecord(12, '31-36个月｜合作、角色与入园准备', '合作、角色与入园准备', '31-36月'),
    chapterRecord(13, '洗澡、换尿布、穿衣', '洗澡、换尿布、穿衣', '生活场景'),
    chapterRecord(14, '餐桌与辅食', '餐桌与辅食', '生活场景'),
    chapterRecord(15, '睡前与安抚', '睡前与安抚', '生活场景'),
    chapterRecord(16, '出门与通勤', '出门与通勤', '生活场景'),
    chapterRecord(17, '看医生、打针、吃药', '看医生、打针、吃药', '生活场景'),
    chapterRecord(18, '分离、入园与二胎', '分离、入园与二胎', '生活场景'),
  ],
  gameIndex: [
    { id: '01', name: '黑白卡追视', chapterNo: 5, age: '0-3月', ability: '认知探索' },
    { id: '15', name: '手帕躲猫猫', chapterNo: 6, age: '4-6月', ability: '社会情绪' },
    { id: '76', name: 'Dance Party', chapterNo: 10, age: '19-24月', ability: '大运动' },
    { id: '130', name: '大宝小宝合作任务', chapterNo: 18, age: '18-36月', ability: '社会情绪' },
  ],
};

const GAME_01 = {
  id: '01',
  name: '黑白卡追视',
  age: '0-3月',
  ageRange: { min: 0, max: 3 },
  ability: '认知探索',
  duration: '3-5分钟',
  place: '床/地垫',
  materials: '黑白卡3-5张',
  people: '1对1',
  play: '让眼睛追着走。',
  steps: ['a', 'b', 'c', 'd'],
  observe: ['x', 'y'],
  up: '换卡',
  down: '静止',
  safety: '不反光',
  question: '不看怎么办',
  art: { main: 'assets/ill/001.svg', panels: ['1', '2', '3', '4'] },
};

const CHAPTER_5 = {
  schemaVersion: 1,
  no: 5,
  title: '0-3个月｜躺着的世界',
  partNo: 2,
  age: '0-3月',
  kind: 'games',
  intro: [{ type: 'p', text: '**发展地图**' }],
  games: [GAME_01],
};

const chapterState = (data) => ({ status: 'ready', data, error: null });

test('路由：目录、章节、游戏三种 hash 可解析与生成', () => {
  assert.deepEqual(parseHash(''), { name: 'toc' });
  assert.deepEqual(parseHash('#'), { name: 'toc' });
  assert.deepEqual(parseHash('#/'), { name: 'toc' });
  assert.deepEqual(parseHash('#/ch/5'), { name: 'chapter', chapterNo: 5, gameId: null });
  assert.deepEqual(parseHash('#/ch/5/game/01'), { name: 'chapter', chapterNo: 5, gameId: '01' });
  assert.deepEqual(parseHash('#/ch/05'), { name: 'chapter', chapterNo: 5, gameId: null });
  assert.deepEqual(parseHash('#/ch/10/game/130'), { name: 'chapter', chapterNo: 10, gameId: '130' });

  assert.equal(buildHash({ name: 'toc' }), '#/');
  assert.equal(buildHash({ name: 'chapter', chapterNo: 5, gameId: null }), '#/ch/5');
  assert.equal(buildHash({ name: 'chapter', chapterNo: 5, gameId: '01' }), '#/ch/5/game/01');
  assert.equal(buildHash({ name: 'chapter', chapterNo: 10, gameId: '130' }), '#/ch/10/game/130');
});

test('路由：游戏编号补零归一', () => {
  assert.equal(normalizeGameId('1'), '01');
  assert.equal(normalizeGameId('01'), '01');
  assert.equal(normalizeGameId('001'), '01');
  assert.equal(normalizeGameId('100'), '100');
  assert.equal(normalizeGameId('130'), '130');
  assert.equal(parseHash('#/ch/5/game/1').gameId, '01');
  assert.equal(parseHash('#/ch/5/game/001').gameId, '01');
});

test('路由：非法输入返回 null', () => {
  assert.equal(parseHash('#/ch/abc'), null);
  assert.equal(parseHash('#/ch/0'), null);
  assert.equal(parseHash('#/ch/5/game/'), null);
  assert.equal(parseHash('#/ch/5/game/01/extra'), null);
  assert.equal(parseHash('#/nope'), null);
  assert.equal(parseHash('#/ch/-1'), null);
});

test('路由：非法 hash 与不存在章节回到目录，不存在游戏回到本章', () => {
  assert.deepEqual(resolveRoute(null, TOC).route, { name: 'toc' });
  assert.match(resolveRoute(null, TOC).notice, /地址|目录/);

  const missingChapter = resolveRoute({ name: 'chapter', chapterNo: 99, gameId: null }, TOC);
  assert.deepEqual(missingChapter.route, { name: 'toc' });
  assert.match(missingChapter.notice, /99/);

  const missingGame = resolveRoute({ name: 'chapter', chapterNo: 5, gameId: '99' }, TOC);
  assert.deepEqual(missingGame.route, { name: 'chapter', chapterNo: 5, gameId: null });
  assert.match(missingGame.notice, /99/);

  const valid = resolveRoute({ name: 'chapter', chapterNo: 5, gameId: '01' }, TOC);
  assert.deepEqual(valid, { route: { name: 'chapter', chapterNo: 5, gameId: '01' }, notice: null });
});

test('相邻章：第5章无上一章、第18章无下一章、12→13 跨篇连续', () => {
  assert.deepEqual(selectNeighbors(TOC, 5), { prev: null, next: TOC.chapters[1] });
  assert.deepEqual(selectNeighbors(TOC, 18), { prev: TOC.chapters[12], next: null });
  assert.equal(selectNeighbors(TOC, 12).next.no, 13);
  assert.equal(selectNeighbors(TOC, 13).prev.no, 12);
  assert.equal(selectNeighbors(TOC, 14).prev.no, 13);
  assert.equal(selectNeighbors(TOC, 14).next.no, 15);
});

test('目录按篇分组，章顺序与书一致', () => {
  const groups = groupChaptersByPart(TOC);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].chapterNos, [5, 6, 7, 8, 9, 10, 11, 12]);
  assert.deepEqual(groups[1].chapterNos, [13, 14, 15, 16, 17, 18]);
  assert.equal(groups[0].title, '分月龄游戏图鉴');
  assert.equal(groups[0].chapters[0].no, 5);
});

test('搜索：忽略首尾空格与大小写，空输入与无结果返回空数组', () => {
  assert.deepEqual(searchGames(TOC, ''), []);
  assert.deepEqual(searchGames(TOC, '   '), []);
  assert.deepEqual(searchGames(TOC, '  躲猫猫  ').map((hit) => hit.id), ['15']);
  assert.deepEqual(searchGames(TOC, 'dance party').map((hit) => hit.id), ['76']);
  assert.deepEqual(searchGames(TOC, '不存在的游戏'), []);
  assert.deepEqual(
    selectTocView({ toc: { status: 'ready', data: TOC }, query: '黑白', chapters: {} }).results.map((hit) => hit.id),
    ['01'],
  );
});

test('搜索结果带有章号、月龄与能力', () => {
  const [hit] = searchGames(TOC, '躲猫猫');
  assert.equal(hit.name, '手帕躲猫猫');
  assert.equal(hit.chapterNo, 6);
  assert.equal(hit.age, '4-6月');
  assert.equal(hit.ability, '社会情绪');
});

test('章节视图模型派生相邻章与当前游戏', () => {
  const state = {
    route: { name: 'chapter', chapterNo: 5, gameId: '01' },
    toc: { status: 'ready', data: TOC, error: null },
    chapters: { 5: chapterState(CHAPTER_5) },
    query: '',
  };

  const view = selectChapterView(state, 5);
  assert.equal(view.status, 'ready');
  assert.equal(view.chapter.no, 5);
  assert.equal(view.prev, null);
  assert.equal(view.next.no, 6);
  assert.equal(view.game.id, '01');
  assert.equal(view.chapter.games.length, 1);

  assert.equal(selectChapterView({ ...state, route: { name: 'chapter', chapterNo: 5, gameId: '02' } }, 5).game, null);
  assert.equal(selectChapterView({ ...state, route: { name: 'chapter', chapterNo: 5, gameId: null } }, 5).game, null);
});

test('章节视图模型透传加载与错误状态', () => {
  const loading = selectChapterView(
    {
      route: { name: 'chapter', chapterNo: 5, gameId: null },
      toc: { status: 'ready', data: TOC, error: null },
      chapters: { 5: { status: 'loading', data: null, error: null } },
      query: '',
    },
    5,
  );
  assert.equal(loading.status, 'loading');
  assert.equal(loading.prev, null);
  assert.equal(loading.next.no, 6);

  const error = new Error('boom');
  const failed = selectChapterView(
    {
      route: { name: 'chapter', chapterNo: 5, gameId: null },
      toc: { status: 'ready', data: TOC, error: null },
      chapters: { 5: { status: 'error', data: null, error } },
      query: '',
    },
    5,
  );
  assert.equal(failed.status, 'error');
  assert.equal(failed.error, error);
});

test('格式化：标题与搜索结果数量', () => {
  assert.equal(resultCountLabel(0), '没有找到匹配的游戏');
  assert.equal(resultCountLabel(3), '找到 3 个游戏');
  assert.equal(chapterHeading(TOC.chapters[0]), '第5章 0-3个月｜躺着的世界');
  assert.equal(chapterHeading(TOC.chapters.find((chapter) => chapter.no === 13)), '第13章 洗澡、换尿布、穿衣');
});
