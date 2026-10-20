import test from 'node:test';
import assert from 'node:assert/strict';

import { buildHash, normalizeGameId, parseHash } from '../src/core/router.js';
import { resolveRoute } from '../src/domain/route.js';
import { groupDocs, searchCatalog, selectNeighbors } from '../src/domain/catalog.js';
import {
  collectChecklistItems,
  decodeChecklistState,
  encodeChecklistState,
  parseChecklistKey,
  sanitizeChecklistKeys,
  toggleChecklistKey,
} from '../src/domain/checklist.js';
import {
  artAlt,
  docHeading,
  docLabel,
  docPartLabel,
  groupLabel,
  pagerText,
  resultCountLabel,
  searchEmptyTitle,
  searchHitMeta,
  searchHitTypeLabel,
  tocBadge,
  zoomButtonLabel,
} from '../src/domain/format.js';
import { selectDocView, selectTocView } from '../src/state/selectors.js';

const docRecord = (id, no, kind, title, shortTitle, meta, partId, count = 0) => ({
  id,
  no,
  kind,
  title,
  shortTitle,
  meta,
  partId,
  count,
  file: id.startsWith('ch') ? `chapters/${id}.json` : `docs/${id}.json`,
});

const DOCS = [
  docRecord('front', null, 'prose', '前置｜序、使用说明、发展地图', '序、使用说明、发展地图', '阅读', 'front'),
  docRecord('ch01', 1, 'prose', '玩就是学习', '玩就是学习', '阅读', 'part-1'),
  docRecord('ch02', 2, 'prose', '好游戏的五个标准', '好游戏的五个标准', '阅读', 'part-1'),
  docRecord('ch03', 3, 'prose', '一天的游戏地图', '一天的游戏地图', '阅读', 'part-1'),
  docRecord('ch04', 4, 'prose', '材料、安全与观察', '材料、安全与观察', '阅读', 'part-1'),
  docRecord('ch05', 5, 'games', '0-3个月｜躺着的世界', '躺着的世界', '0-3月', 'part-2', 10),
  docRecord('ch06', 6, 'games', '4-6个月｜翻身与抓握', '翻身与抓握', '4-6月', 'part-2', 12),
  docRecord('ch07', 7, 'games', '7-9个月｜坐起来，够世界', '坐起来，够世界', '7-9月', 'part-2', 12),
  docRecord('ch08', 8, 'games', '10-12个月｜爬、站、走', '爬、站、走', '10-12月', 'part-2', 14),
  docRecord('ch09', 9, 'games', '13-18个月｜行走与探索', '行走与探索', '13-18月', 'part-2', 14),
  docRecord('ch10', 10, 'games', '19-24个月｜语言爆发与“我自己来”', '语言爆发与“我自己来”', '19-24月', 'part-2', 14),
  docRecord('ch11', 11, 'games', '25-30个月｜假装游戏与规则萌芽', '假装游戏与规则萌芽', '25-30月', 'part-2', 12),
  docRecord('ch12', 12, 'games', '31-36个月｜合作、角色与入园准备', '合作、角色与入园准备', '31-36月', 'part-2', 12),
  docRecord('ch13', 13, 'games', '洗澡、换尿布、穿衣', '洗澡、换尿布、穿衣', '生活场景', 'part-3', 6),
  docRecord('ch14', 14, 'games', '餐桌与辅食', '餐桌与辅食', '生活场景', 'part-3', 6),
  docRecord('ch15', 15, 'games', '睡前与安抚', '睡前与安抚', '生活场景', 'part-3', 5),
  docRecord('ch16', 16, 'games', '出门与通勤', '出门与通勤', '生活场景', 'part-3', 5),
  docRecord('ch17', 17, 'games', '看医生、打针、吃药', '看医生、打针、吃药', '生活场景', 'part-3', 4),
  docRecord('ch18', 18, 'games', '分离、入园与二胎', '分离、入园与二胎', '生活场景', 'part-3', 4),
  docRecord('ch19', 19, 'prose', '老人与保姆带娃', '老人与保姆带娃', '阅读', 'part-4'),
  docRecord('ch20', 20, 'prose', '早产儿与发育偏慢宝宝', '早产儿与发育偏慢宝宝', '阅读', 'part-4'),
  docRecord('ch21', 21, 'prose', '屏幕、电子玩具与“电子保姆”', '屏幕、电子玩具与“电子保姆”', '阅读', 'part-4'),
  docRecord('apx-a', null, 'prose', '附录A 0-36个月发育里程碑与警示信号', '0-36个月发育里程碑与警示信号', '附录', 'appendix'),
  docRecord('apx-b', null, 'prose', '附录B 家庭安全排查清单', '家庭安全排查清单', '附录', 'appendix'),
  docRecord('apx-c', null, 'prose', '附录C 五维索引使用说明', '五维索引使用说明', '附录', 'appendix'),
  docRecord('apx-d', null, 'prose', '附录D 分月龄绘本清单', '分月龄绘本清单', '附录', 'appendix'),
  docRecord('apx-e', null, 'prose', '附录E 30首亲子儿歌与手指谣', '30首亲子儿歌与手指谣', '附录', 'appendix'),
  docRecord('apx-f', null, 'prose', '附录F 游戏记录页（可复印）', '游戏记录页（可复印）', '附录', 'appendix'),
];

const GROUPS = [
  { id: 'front', title: '前置', docIds: ['front'] },
  { id: 'part-1', no: 1, title: '会玩的孩子', docIds: ['ch01', 'ch02', 'ch03', 'ch04'] },
  { id: 'part-2', no: 2, title: '分月龄游戏图鉴', docIds: ['ch05', 'ch06', 'ch07', 'ch08', 'ch09', 'ch10', 'ch11', 'ch12'] },
  { id: 'part-3', no: 3, title: '把游戏放进生活', docIds: ['ch13', 'ch14', 'ch15', 'ch16', 'ch17', 'ch18'] },
  { id: 'part-4', no: 4, title: '不同家庭的玩法', docIds: ['ch19', 'ch20', 'ch21'] },
  { id: 'appendix', title: '附录', docIds: ['apx-a', 'apx-b', 'apx-c', 'apx-d', 'apx-e', 'apx-f'] },
];

const GAME_INDEX = [
  { id: '01', name: '黑白卡追视', docId: 'ch05', chapterNo: 5, age: '0-3月', ability: '认知探索' },
  { id: '15', name: '手帕躲猫猫', docId: 'ch06', chapterNo: 6, age: '4-6月', ability: '社会情绪' },
  { id: '16', name: '翻身与抓握', docId: 'ch06', chapterNo: 6, age: '4-6月', ability: '大运动' },
  { id: '76', name: 'Dance Party', docId: 'ch10', chapterNo: 10, age: '19-24月', ability: '大运动' },
  { id: '130', name: '大宝小宝合作任务', docId: 'ch18', chapterNo: 18, age: '24-36月', ability: '社会情绪' },
];

const TOC = {
  schemaVersion: 2,
  bookVersion: 'v1.4',
  book: {
    title: '0-3岁亲子游戏图鉴',
    subtitle: '130个游戏，把日常变成早教',
    total: 130,
    chapterCount: 21,
    docCount: 28,
  },
  groups: GROUPS,
  docs: DOCS,
  gameIndex: GAME_INDEX,
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
  art: { main: 'assets/art/panel_web/001-1.jpg', panels: ['1', '2', '3', '4'] },
};

const GAMES_DOC = {
  schemaVersion: 2,
  id: 'ch05',
  no: 5,
  kind: 'games',
  title: '0-3个月｜躺着的世界',
  partId: 'part-2',
  meta: '0-3月',
  intro: [{ type: 'p', text: '**发展地图**' }],
  games: [GAME_01],
};

const PROSE_DOC = {
  schemaVersion: 2,
  id: 'ch01',
  no: 1,
  kind: 'prose',
  title: '玩就是学习',
  partId: 'part-1',
  meta: '阅读',
  blocks: [{ type: 'p', text: '小满四个月的时候。' }],
  sections: [],
};

const docState = (data) => ({ status: 'ready', data, error: null });

test('路由：目录、前置、章节、游戏与附录可解析与生成', () => {
  assert.deepEqual(parseHash(''), { name: 'toc' });
  assert.deepEqual(parseHash('#'), { name: 'toc' });
  assert.deepEqual(parseHash('#/'), { name: 'toc' });
  assert.deepEqual(parseHash('#/front'), { name: 'doc', docId: 'front', gameId: null });
  assert.deepEqual(parseHash('#/ch/1'), { name: 'doc', docId: 'ch01', gameId: null });
  assert.deepEqual(parseHash('#/ch/05'), { name: 'doc', docId: 'ch05', gameId: null });
  assert.deepEqual(parseHash('#/ch/5/game/01'), { name: 'doc', docId: 'ch05', gameId: '01' });
  assert.deepEqual(parseHash('#/ch/10/game/130'), { name: 'doc', docId: 'ch10', gameId: '130' });
  assert.deepEqual(parseHash('#/appendix/a'), { name: 'doc', docId: 'apx-a', gameId: null });
  assert.deepEqual(parseHash('#/appendix/A'), { name: 'doc', docId: 'apx-a', gameId: null });

  assert.equal(buildHash({ name: 'toc' }), '#/');
  assert.equal(buildHash({ name: 'doc', docId: 'front', gameId: null }), '#/front');
  assert.equal(buildHash({ name: 'doc', docId: 'ch05', gameId: null }), '#/ch/5');
  assert.equal(buildHash({ name: 'doc', docId: 'ch05', gameId: '01' }), '#/ch/5/game/01');
  assert.equal(buildHash({ name: 'doc', docId: 'apx-a', gameId: null }), '#/appendix/a');
  assert.equal(buildHash({ name: 'doc', docId: 'ch01', gameId: null }), '#/ch/1');
});

test('路由：游戏编号补零归一', () => {
  assert.equal(normalizeGameId('1'), '01');
  assert.equal(normalizeGameId('01'), '01');
  assert.equal(normalizeGameId('001'), '01');
  assert.equal(normalizeGameId('100'), '100');
  assert.equal(normalizeGameId('130'), '130');
  assert.equal(parseHash('#/ch/5/game/1').gameId, '01');
  assert.equal(parseHash('#/ch/5/game/001').gameId, '01');
  assert.equal(buildHash({ name: 'doc', docId: 'ch05', gameId: '01' }), '#/ch/5/game/01');
});

test('路由：非法输入返回 null', () => {
  assert.equal(parseHash('#/ch/abc'), null);
  assert.equal(parseHash('#/ch/0'), null);
  assert.equal(parseHash('#/ch/5/game/'), null);
  assert.equal(parseHash('#/ch/5/game/01/extra'), null);
  assert.equal(parseHash('#/nope'), null);
  assert.equal(parseHash('#/ch/-1'), null);
  assert.deepEqual(parseHash('#/appendix/G'), { name: 'doc', docId: 'apx-g', gameId: null });
  assert.equal(parseHash('#/front/game/01'), null);
});

test('路由校验：非法文档回目录，游戏不属于该文档回该文档', () => {
  assert.deepEqual(resolveRoute(null, TOC).route, { name: 'toc' });
  assert.match(resolveRoute(null, TOC).notice, /地址|目录/);

  const missingChapter = resolveRoute({ name: 'doc', docId: 'ch99', gameId: null }, TOC);
  assert.deepEqual(missingChapter.route, { name: 'toc' });
  assert.match(missingChapter.notice, /99/);

  const missingAppendix = resolveRoute({ name: 'doc', docId: 'apx-z', gameId: null }, TOC);
  assert.deepEqual(missingAppendix.route, { name: 'toc' });
  assert.match(missingAppendix.notice, /附录 Z/);

  const missingGame = resolveRoute({ name: 'doc', docId: 'ch05', gameId: '99' }, TOC);
  assert.deepEqual(missingGame.route, { name: 'doc', docId: 'ch05', gameId: null });
  assert.match(missingGame.notice, /99/);

  const proseGame = resolveRoute({ name: 'doc', docId: 'ch01', gameId: '01' }, TOC);
  assert.deepEqual(proseGame.route, { name: 'doc', docId: 'ch01', gameId: null });
  assert.match(proseGame.notice, /没有游戏/);

  const valid = resolveRoute({ name: 'doc', docId: 'ch05', gameId: '01' }, TOC);
  assert.deepEqual(valid, { route: { name: 'doc', docId: 'ch05', gameId: '01' }, notice: null });
});

test('相邻页：前置无上一页、附录 F 无下一页，跨篇与跨附录连续', () => {
  assert.deepEqual(selectNeighbors(TOC, 'front'), { prev: null, next: DOCS[1] });
  assert.equal(selectNeighbors(TOC, 'ch01').prev.id, 'front');
  assert.equal(selectNeighbors(TOC, 'ch04').next.id, 'ch05');
  assert.equal(selectNeighbors(TOC, 'ch05').prev.id, 'ch04');
  assert.equal(selectNeighbors(TOC, 'ch12').next.id, 'ch13');
  assert.equal(selectNeighbors(TOC, 'ch13').prev.id, 'ch12');
  assert.equal(selectNeighbors(TOC, 'ch18').next.id, 'ch19');
  assert.equal(selectNeighbors(TOC, 'ch21').next.id, 'apx-a');
  assert.equal(selectNeighbors(TOC, 'apx-a').prev.id, 'ch21');
  assert.equal(selectNeighbors(TOC, 'apx-b').prev.id, 'apx-a');
  assert.deepEqual(selectNeighbors(TOC, 'apx-f'), { prev: DOCS[DOCS.length - 2], next: null });
});

test('目录按三前置 / 四篇 / 附录分组，顺序与全书一致', () => {
  const groups = groupDocs(TOC);
  assert.equal(groups.length, 6);
  assert.deepEqual(groups.map((group) => group.docs.length), [1, 4, 8, 6, 3, 6]);
  assert.deepEqual(
    groups.flatMap((group) => group.docs.map((doc) => doc.id)),
    DOCS.map((doc) => doc.id),
  );
  assert.equal(groups[1].title, '会玩的孩子');
  assert.equal(groups[1].docs[0].id, 'ch01');
});

test('搜索：文档标题与游戏名同池，类型标签区分游戏 / 章节 / 附录 / 前置', () => {
  assert.deepEqual(searchCatalog(TOC, ''), []);
  assert.deepEqual(searchCatalog(TOC, '   '), []);

  const milestone = searchCatalog(TOC, '里程碑');
  assert.equal(milestone[0].kind, 'doc');
  assert.equal(milestone[0].docId, 'apx-a');
  assert.equal(searchHitTypeLabel(milestone[0]), '附录');
  assert.equal(searchHitMeta(milestone[0]), '附录');

  const hide = searchCatalog(TOC, '躲猫猫');
  assert.equal(hide[0].kind, 'game');
  assert.equal(hide[0].docId, 'ch06');
  assert.equal(hide[0].gameId, '15');
  assert.equal(searchHitTypeLabel(hide[0]), '游戏');
  assert.equal(searchHitMeta(hide[0]), '4-6月 · 社会情绪');

  const dance = searchCatalog(TOC, 'dance party');
  assert.deepEqual(dance.map((hit) => hit.gameId), ['76']);

  const front = searchCatalog(TOC, '前置');
  assert.equal(front[0].docId, 'front');
  assert.equal(searchHitTypeLabel(front[0]), '前置');

  const chapter = searchCatalog(TOC, '玩就是学习');
  assert.equal(chapter[0].docId, 'ch01');
  assert.equal(searchHitTypeLabel(chapter[0]), '章节');
  assert.equal(searchHitMeta(chapter[0]), '第1章');
});

test('搜索排序：完全匹配优先，同一文档内游戏在文档之前', () => {
  const hits = searchCatalog(TOC, '翻身与抓握');
  assert.equal(hits[0].kind, 'game');
  assert.equal(hits[0].gameId, '16');
  assert.equal(hits[1].kind, 'doc');
  assert.equal(hits[1].docId, 'ch06');

  const party = searchCatalog(TOC, 'Dance');
  assert.equal(party[0].kind, 'game');
  assert.equal(party[0].gameId, '76');

  assert.deepEqual(searchCatalog(TOC, '不存在的游戏'), []);
});

test('目录视图模型分发分组与搜索结果', () => {
  const view = selectTocView({ toc: { status: 'ready', data: TOC }, query: '里程碑' });
  assert.equal(view.status, 'ready');
  assert.equal(view.groups.length, 6);
  assert.equal(view.total, 130);
  assert.equal(view.chapterCount, 21);
  assert.equal(view.docCount, 28);
  assert.equal(view.resultCount, 1);
  assert.equal(view.results[0].docId, 'apx-a');
});

test('文档视图模型派生类型、相邻页与当前游戏', () => {
  const state = {
    route: { name: 'doc', docId: 'ch05', gameId: '01' },
    toc: { status: 'ready', data: TOC, error: null },
    docs: { ch05: docState(GAMES_DOC), ch01: docState(PROSE_DOC) },
    query: '',
  };

  const games = selectDocView(state, 'ch05');
  assert.equal(games.status, 'ready');
  assert.equal(games.kind, 'games');
  assert.equal(games.doc.no, 5);
  assert.equal(games.prev.no, 4);
  assert.equal(games.next.no, 6);
  assert.equal(games.game.id, '01');

  const prose = selectDocView({ ...state, route: { name: 'doc', docId: 'ch01', gameId: '01' } }, 'ch01');
  assert.equal(prose.kind, 'prose');
  assert.equal(prose.game, null);
  assert.equal(prose.prev.id, 'front');

  const missingGame = selectDocView({ ...state, route: { name: 'doc', docId: 'ch05', gameId: '02' } }, 'ch05');
  assert.equal(missingGame.game, null);
});

test('详情视图派生：章内序号、上/下一个游戏与首尾边界', () => {
  const gamesDoc = {
    ...GAMES_DOC,
    id: 'ch06',
    no: 6,
    games: [
      { ...GAME_01, id: '15', name: '手帕躲猫猫' },
      { ...GAME_01, id: '16', name: '翻身与抓握' },
      { ...GAME_01, id: '20', name: '第三个游戏' },
    ],
  };
  const state = (gameId) => ({
    route: { name: 'doc', docId: 'ch06', gameId },
    toc: { status: 'ready', data: TOC, error: null },
    docs: { ch06: docState(gamesDoc) },
    query: '',
  });

  const middle = selectDocView(state('16'), 'ch06');
  assert.equal(middle.game.name, '翻身与抓握');
  assert.equal(middle.gameIndex, 2);
  assert.equal(middle.gameCount, 3);
  assert.equal(middle.prevGame.id, '15');
  assert.equal(middle.nextGame.id, '20');

  const first = selectDocView(state('15'), 'ch06');
  assert.equal(first.gameIndex, 1);
  assert.equal(first.prevGame, null);
  assert.equal(first.nextGame.id, '16');

  const last = selectDocView(state('20'), 'ch06');
  assert.equal(last.gameIndex, 3);
  assert.equal(last.nextGame, null);

  const closed = selectDocView({ ...state(null), route: { name: 'doc', docId: 'ch06', gameId: null } }, 'ch06');
  assert.equal(closed.game, null);
  assert.equal(closed.gameIndex, null);
  assert.equal(closed.gameCount, 3);
  assert.equal(closed.prevGame, null);
  assert.equal(closed.nextGame, null);

  const missing = selectDocView(state('99'), 'ch06');
  assert.equal(missing.game, null);
  assert.equal(missing.gameIndex, null);
  assert.equal(missing.prevGame, null);
  assert.equal(missing.nextGame, null);

  const prose = selectDocView({
    route: { name: 'doc', docId: 'ch01', gameId: null },
    toc: { status: 'ready', data: TOC, error: null },
    docs: { ch01: docState(PROSE_DOC) },
    query: '',
  }, 'ch01');
  assert.equal(prose.gameIndex, null);
  assert.equal(prose.gameCount, null);
});

test('文档视图模型透传加载与错误状态', () => {
  const loading = selectDocView({
    route: { name: 'doc', docId: 'ch05', gameId: null },
    toc: { status: 'ready', data: TOC, error: null },
    docs: { ch05: { status: 'loading', data: null, error: null } },
    query: '',
  }, 'ch05');
  assert.equal(loading.status, 'loading');
  assert.equal(loading.kind, 'games');
  assert.equal(loading.next.no, 6);

  const error = new Error('boom');
  const failed = selectDocView({
    route: { name: 'doc', docId: 'ch01', gameId: null },
    toc: { status: 'ready', data: TOC, error: null },
    docs: { ch01: { status: 'error', data: null, error } },
    query: '',
  }, 'ch01');
  assert.equal(failed.status, 'error');
  assert.equal(failed.error, error);
  assert.equal(failed.kind, 'prose');
});

test('文档标签：章节、前置与附录各有稳定写法', () => {
  const byId = (id) => DOCS.find((doc) => doc.id === id);

  assert.equal(docLabel(byId('ch05')), '第5章 躺着的世界');
  assert.equal(docLabel(byId('front')), '前置：序、使用说明、发展地图');
  assert.equal(docLabel(byId('apx-a')), '附录A 0-36个月发育里程碑与警示信号');

  assert.equal(docHeading(byId('ch01')), '第1章 玩就是学习');
  assert.equal(docHeading(byId('ch05')), '第5章 0-3个月｜躺着的世界');
  assert.equal(docHeading(byId('front')), '前置｜序、使用说明、发展地图');
  assert.equal(docHeading(byId('apx-a')), '附录A 0-36个月发育里程碑与警示信号');

  assert.equal(groupLabel(GROUPS[1]), '第一篇 会玩的孩子');
  assert.equal(groupLabel(GROUPS[0]), '前置');
  assert.equal(groupLabel(GROUPS[5]), '附录');
  assert.equal(docPartLabel(byId('ch05'), GROUPS), '第二篇 分月龄游戏图鉴');
  assert.equal(docPartLabel(byId('apx-a'), GROUPS), '附录');
});

test('翻页文案：工具栏与页脚同源', () => {
  const chapter = DOCS.find((doc) => doc.id === 'ch05');

  assert.deepEqual(pagerText(chapter, 'prev'), {
    dir: '← 上一页',
    label: '第5章 躺着的世界',
    aria: '上一页：第5章 躺着的世界',
  });
  assert.equal(pagerText(chapter, 'next').dir, '下一页 →');
  assert.equal(pagerText(null, 'prev').label, '已是第一页');
  assert.equal(pagerText(null, 'next').aria, '已经是最后一页');
});

test('目录徽标：游戏章图文、文字章纯文字、未知为空', () => {
  const byId = (id) => DOCS.find((doc) => doc.id === id);
  assert.equal(tocBadge(byId('ch05')), '图文');
  assert.equal(tocBadge(byId('ch13')), '图文');
  assert.equal(tocBadge(byId('ch01')), '纯文字');
  assert.equal(tocBadge(byId('front')), '纯文字');
  assert.equal(tocBadge(byId('apx-b')), '纯文字');
  assert.equal(tocBadge(null), '');
  assert.equal(tocBadge({ id: 'x' }), '');
});

test('格式化：结果计数、空态与图片可访问名称', () => {
  assert.equal(resultCountLabel(0), '没有找到匹配的内容');
  assert.equal(resultCountLabel(3), '找到 3 条结果');
  assert.equal(searchEmptyTitle('里程碑'), '没有找到“里程碑”');

  const game = { name: '躲猫猫' };
  assert.equal(artAlt(game), '躲猫猫主图');
  assert.equal(artAlt(game, 0), '躲猫猫步骤图 1');
  assert.equal(artAlt(game, 3), '躲猫猫步骤图 4');
  assert.equal(zoomButtonLabel(game), '放大躲猫猫主图');
  assert.equal(zoomButtonLabel(game, 1), '放大躲猫猫步骤图 2');
});

test('清单状态：编码解码与越界键忽略', () => {
  const blocks = [
    { type: 'p', text: '说明' },
    { type: 'checklist', items: [{ text: 'a', checked: false }, { text: 'b', checked: true }] },
    { type: 'p', text: '结尾' },
  ];

  const items = collectChecklistItems(blocks);
  assert.deepEqual(items.map((item) => item.key), ['1:0', '1:1']);
  assert.equal(items[1].checked, true);

  const encoded = encodeChecklistState(new Set(['1:1', '1:0']));
  assert.equal(encoded, '["1:0","1:1"]');
  assert.deepEqual([...decodeChecklistState(encoded)], ['1:0', '1:1']);

  assert.deepEqual([...decodeChecklistState('')], []);
  assert.deepEqual([...decodeChecklistState('not json')], []);
  assert.deepEqual([...decodeChecklistState('{"a":1}')], []);
  assert.deepEqual([...decodeChecklistState('[1,"1:0","x","2:"]')], ['1:0']);

  assert.deepEqual(parseChecklistKey('3:12'), { blockIndex: 3, itemIndex: 12 });
  assert.equal(parseChecklistKey('3:'), null);

  assert.deepEqual(
    [...sanitizeChecklistKeys(new Set(['1:0', '1:9', '0:0', '2:0']), blocks)],
    ['1:0'],
  );
  assert.deepEqual([...toggleChecklistKey(new Set(['1:0']), '1:1', true)], ['1:0', '1:1']);
  assert.deepEqual([...toggleChecklistKey(new Set(['1:0', '1:1']), '1:1', false)], ['1:0']);
});
