import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PERF = process.argv.includes('--perf');
const SLOW = process.argv.includes('--slow');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function startServer({ mount = '/' } = {}) {
  const prefix = mount.endsWith('/') ? mount : `${mount}/`;
  return new Promise((resolvePromise, reject) => {
    const server = createServer((request, response) => {
      let pathname;
      try {
        pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
      } catch {
        response.writeHead(400);
        response.end();
        return;
      }
      if (!pathname.startsWith(prefix)) {
        response.writeHead(404);
        response.end();
        return;
      }
      pathname = `/${pathname.slice(prefix.length)}`;
      if (pathname === '/') pathname = '/index.html';
      const file = normalize(join(ROOT, pathname));
      if (file !== ROOT && !file.startsWith(ROOT + sep)) {
        response.writeHead(403);
        response.end();
        return;
      }
      if (!existsSync(file) || !statSync(file).isFile()) {
        response.writeHead(404);
        response.end();
        return;
      }
      response.writeHead(200, {
        'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      createReadStream(file).pipe(response);
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolvePromise(server));
  });
}

function findChrome() {
  const candidates = [
    process.env.CHROME,
    'google-chrome',
    'google-chrome-stable',
    'chromium',
    'chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate.includes('/')) {
      if (existsSync(candidate)) return candidate;
      continue;
    }
    try {
      const found = execFileSync('which', [candidate], { encoding: 'utf8' }).trim();
      if (found) return found;
    } catch {
      // 继续找下一个。
    }
  }
  return null;
}

async function launchChrome(chrome, profile) {
  const child = spawn(chrome, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--hide-scrollbars',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    'about:blank',
  ], { stdio: 'ignore' });

  const portFile = join(profile, 'DevToolsActivePort');
  for (let index = 0; index < 120; index += 1) {
    if (existsSync(portFile)) break;
    if (child.exitCode !== null) throw new Error('Chrome 启动失败');
    await sleep(100);
  }
  if (!existsSync(portFile)) throw new Error('Chrome 未在 12s 内启动');
  const [port] = readFileSync(portFile, 'utf8').split('\n');
  return { child, port: Number(port) };
}

async function pageTarget(port) {
  for (let index = 0; index < 100; index += 1) {
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
      const page = targets.find((target) => target.type === 'page');
      if (page?.webSocketDebuggerUrl) return page;
    } catch {
      // Chrome 还在起。
    }
    await sleep(100);
  }
  throw new Error('找不到 Chrome page target');
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.seq = 0;
    this.pending = new Map();
    ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      const handler = this.pending.get(message.id);
      if (!handler) return;
      this.pending.delete(message.id);
      if (message.error) handler.reject(new Error(JSON.stringify(message.error)));
      else handler.resolve(message.result);
    });
  }

  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((resolvePromise, reject) => {
      ws.addEventListener('open', resolvePromise, { once: true });
      ws.addEventListener('error', reject, { once: true });
    });
    return new Cdp(ws);
  }

  send(method, params = {}) {
    return new Promise((resolvePromise, reject) => {
      const id = ++this.seq;
      this.pending.set(id, { resolve: resolvePromise, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    try {
      const result = await this.send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      if (result.exceptionDetails) {
        const text = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text;
        if (String(text).includes('Execution context was destroyed')) return null;
        throw new Error(text);
      }
      return result.result.value;
    } catch (error) {
      if (/context|Cannot find|Inspected target navigated/i.test(String(error.message))) return null;
      throw error;
    }
  }

  async waitFor(expression, label, timeout = 10000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      if (await this.evaluate(expression)) return;
      await sleep(60);
    }
    throw new Error(`等待超时：${label}`);
  }

  async navigate(url) {
    await this.send('Page.navigate', { url });
  }

  close() {
    this.ws.close();
  }
}

const failures = [];
let checkCount = 0;

function check(label, actual, expected) {
  checkCount += 1;
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? '✓' : '✗'} ${label}${ok ? '' : `：期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`}`);
  if (!ok) failures.push(label);
}

async function pressKey(cdp, key, code, keyCode) {
  for (const type of ['keyDown', 'keyUp']) {
    await cdp.send('Input.dispatchKeyEvent', {
      type,
      key,
      code,
      windowsVirtualKeyCode: keyCode,
      nativeVirtualKeyCode: keyCode,
      ...(key === ' ' && type === 'keyDown' ? { text: ' ' } : {}),
    });
  }
  await sleep(140);
}

const pressEscape = (cdp) => pressKey(cdp, 'Escape', 'Escape', 27);

async function setSearch(cdp, value) {
  await cdp.evaluate(`(() => {
    const input = document.querySelector('#catalog-search');
    input.value = ${JSON.stringify(value)};
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
}

async function runChecks(cdp, app) {
  await cdp.navigate(`${app}/#/`);
  await cdp.waitFor("document.querySelectorAll('.toc-row').length === 28", '目录 28 行');

  check('目录分组数', await cdp.evaluate("document.querySelectorAll('.toc__part-title').length"), 6);
  check('目录首组', await cdp.evaluate("document.querySelector('.toc__part-title').textContent"), '前置');
  check('目录末组', await cdp.evaluate("document.querySelectorAll('.toc__part-title')[5].textContent"), '附录');
  check('目录计数', await cdp.evaluate("document.querySelector('.toc-hero__count').textContent"), '130 个游戏 · 21 章 · 28 个文档');
  check('附录行号', await cdp.evaluate("[...document.querySelectorAll('.toc-row__no')][22].textContent"), 'A');
  check('游戏章图文徽标', await cdp.evaluate("document.querySelector('.toc-row__badge--art')?.textContent"), '图文');
  check('文字章纯文字徽标', await cdp.evaluate("[...document.querySelectorAll('.toc-row__badge')].filter((badge) => !badge.classList.contains('toc-row__badge--art'))[0]?.textContent"), '纯文字');
  check('徽标进入行可访问名称', await cdp.evaluate("[...document.querySelectorAll('.toc-row')].some((row) => row.getAttribute('aria-label').includes('图文'))"), true);

  await setSearch(cdp, '里程碑');
  check('搜索类型标签', await cdp.evaluate("document.querySelector('.search-hit__tag').textContent"), '附录');
  check('搜索命中标题', await cdp.evaluate("document.querySelector('.search-hit__name').textContent"), '附录A 0-36个月发育里程碑与警示信号');
  check('搜索命中链接', await cdp.evaluate("document.querySelector('.search-hit').getAttribute('href')"), '#/appendix/a');
  check('搜索计数', await cdp.evaluate("document.querySelector('.search__count').textContent"), '找到 1 条结果');

  await setSearch(cdp, '躲猫猫');
  check('游戏搜索直达链接', await cdp.evaluate("document.querySelector('.search-hit').getAttribute('href')"), '#/ch/6/game/15');
  check('游戏搜索补充信息', await cdp.evaluate("document.querySelector('.search-hit__meta').textContent"), '4-6月 · 社会情绪');

  await setSearch(cdp, '不存在的内容');
  check('空结果提示', await cdp.evaluate("document.querySelector('.search-empty__title').textContent"), '没有找到“不存在的内容”');
  await cdp.evaluate("document.querySelector('.search__clear').click()");
  check('清除搜索后输入为空', await cdp.evaluate("document.querySelector('#catalog-search').value"), '');
  check('清除搜索后目录恢复', await cdp.evaluate("!document.querySelector('.toc-page__toc').hidden"), true);

  await cdp.evaluate("location.hash = '#/appendix/b'");
  await cdp.waitFor("document.querySelectorAll('.prose__checklist input[type=checkbox]').length === 37", '附录 B 37 项清单');
  check('清单分组数', await cdp.evaluate("document.querySelectorAll('.prose__checklist').length"), 6);
  check('重置按钮可见', await cdp.evaluate("!document.querySelector('.prose-head__reset').hidden"), true);

  await cdp.evaluate("document.querySelector('.prose__checklist input[type=checkbox]').click()");
  check('勾选写入本地', await cdp.evaluate("JSON.parse(localStorage.getItem('babyGame:checklist:apx-b')).length"), 1);

  await cdp.send('Page.reload', { ignoreCache: true });
  await cdp.waitFor("document.querySelectorAll('.prose__checklist input[type=checkbox]').length === 37", '刷新后清单');
  check('刷新后勾选保留', await cdp.evaluate("document.querySelector('.prose__checklist input[type=checkbox]').checked"), true);

  await cdp.evaluate("document.querySelector('.prose-head__reset').click()");
  check('重置后取消勾选', await cdp.evaluate("document.querySelector('.prose__checklist input[type=checkbox]').checked"), false);
  check('重置后清空存储', await cdp.evaluate("localStorage.getItem('babyGame:checklist:apx-b')"), null);

  await cdp.evaluate("document.querySelector('.prose__checklist input[type=checkbox]').focus()");
  await pressKey(cdp, ' ', 'Space', 32);
  check('空格键勾选清单', await cdp.evaluate("document.querySelector('.prose__checklist input[type=checkbox]').checked"), true);
  check('空格勾选写入本地', await cdp.evaluate("JSON.parse(localStorage.getItem('babyGame:checklist:apx-b')).length"), 1);
  await cdp.evaluate("document.querySelector('.prose-head__reset').click()");

  await cdp.evaluate("location.hash = '#/ch/4'");
  await cdp.waitFor("document.querySelector('.prose-head__title')?.textContent.startsWith('第4章')", '第 4 章');
  check('页头所属篇', await cdp.evaluate("document.querySelector('.prose-head__part').textContent"), '第一篇 会玩的孩子');
  check('页脚下一页', await cdp.evaluate("document.querySelectorAll('.footer-nav__chapter')[1].textContent"), '第5章 躺着的世界');

  await pressKey(cdp, 'ArrowRight', 'ArrowRight', 39);
  await cdp.waitFor("location.hash === '#/ch/5' && document.querySelector('.chapter__title')?.textContent.startsWith('第5章')", '方向键进入第 5 章');
  check('切页后焦点在标题', await cdp.evaluate('document.activeElement.className'), 'chapter__title');
  check('游戏卡片数', await cdp.evaluate("document.querySelectorAll('.card').length"), 10);

  await cdp.evaluate("location.hash = '#/ch/10'");
  await cdp.waitFor("document.querySelector('.chapter__title')?.textContent.startsWith('第10章')", '第 10 章');
  await cdp.evaluate("location.hash = '#/ch/10/game/76'");
  await cdp.waitFor("!document.querySelector('.game-detail-host')?.hidden", '深链打开详情页');
  check('详情页无对话框元素', await cdp.evaluate("document.querySelector('dialog.game-dialog') === null"), true);
  check('深链详情标题', await cdp.evaluate("document.querySelector('.game-detail__title').textContent"), '儿歌接龙');
  check('深链详情位置行', await cdp.evaluate("document.querySelector('.game-detail__location').textContent"), '第10章 · 14/14');
  check('深链详情焦点在标题', await cdp.evaluate('document.activeElement.className'), 'game-detail__title');
  check('详情页隐藏工具栏', await cdp.evaluate("document.querySelector('.chapter-bar').hidden"), true);
  await cdp.evaluate('history.back()');
  await cdp.waitFor("document.querySelector('.game-detail-host')?.hidden", '后退回列表');
  check('后退回到第 10 章', await cdp.evaluate('location.hash'), '#/ch/10');

  await cdp.evaluate("location.hash = '#/ch/5'");
  await cdp.waitFor("document.querySelectorAll('.card').length === 10", '第 5 章卡片');
  await cdp.evaluate("window.scrollTo({ top: 400, behavior: 'instant' })");
  await sleep(120);
  await cdp.evaluate("document.querySelectorAll('.card')[2].click()");
  await cdp.waitFor("!document.querySelector('.game-detail-host')?.hidden", '点卡片进详情');
  check('进入详情回到顶部', await cdp.evaluate('window.scrollY'), 0);
  await cdp.evaluate("document.querySelector('.game-detail__hero').click()");
  await cdp.waitFor("document.querySelector('.image-lightbox')?.open === true", '详情主图大图');
  check('大图标题', await cdp.evaluate("document.querySelector('.image-lightbox__title').textContent"), '声音寻源');
  check('大图计数', await cdp.evaluate("document.querySelector('.image-lightbox__caption').textContent.includes('1 / 4')"), true);
  await pressEscape(cdp);
  check('Esc 关闭大图', await cdp.evaluate("document.querySelector('.image-lightbox').open"), false);
  check('大图关闭后焦点回主图', await cdp.evaluate('document.activeElement.className.includes("game-detail__hero")'), true);
  await cdp.evaluate("document.querySelector('.game-detail__back').click()");
  await cdp.waitFor("document.querySelector('.game-detail-host')?.hidden", '返回列表');
  check('返回恢复滚动位置', await cdp.evaluate('Math.abs(window.scrollY - 400) < 2'), true);
  check('返回焦点回触发卡片', await cdp.evaluate("document.activeElement.dataset.gameId"), '03');
  check('返回回到章节地址', await cdp.evaluate('location.hash'), '#/ch/5');

  await cdp.evaluate("document.querySelectorAll('.card')[0].click()");
  await cdp.waitFor("!document.querySelector('.game-detail-host')?.hidden", '进入第一个游戏');
  check('第一个游戏禁用上一个', await cdp.evaluate("document.querySelectorAll('.game-detail__pager-button')[0].disabled"), true);
  check('第一个游戏可下一个', await cdp.evaluate("document.querySelectorAll('.game-detail__pager-button')[1].disabled"), false);
  await pressKey(cdp, 'ArrowRight', 'ArrowRight', 39);
  await cdp.waitFor("document.querySelector('.game-detail__location').textContent.includes('02/10')", '方向键切下一个游戏');
  check('切游戏仍是详情地址', await cdp.evaluate('location.hash'), '#/ch/5/game/02');
  await cdp.evaluate("document.querySelectorAll('.panel')[1].click()");
  await cdp.waitFor("document.querySelector('.image-lightbox')?.open === true", '步骤图大图');
  check('步骤图从第 2 张开始', await cdp.evaluate("document.querySelector('.image-lightbox__caption').textContent.includes('2 / 4')"), true);
  await pressKey(cdp, 'ArrowRight', 'ArrowRight', 39);
  check('大图内方向键切图', await cdp.evaluate("document.querySelector('.image-lightbox__caption').textContent.includes('3 / 4')"), true);
  await pressEscape(cdp);
  check('Esc 只关大图详情保留', await cdp.evaluate("!document.querySelector('.game-detail-host')?.hidden"), true);
  await pressEscape(cdp);
  await cdp.waitFor("document.querySelector('.game-detail-host')?.hidden", 'Esc 返回列表');
  check('Esc 后退一次回列表', await cdp.evaluate('location.hash'), '#/ch/5');

  await cdp.evaluate("location.hash = '#/ch/5/game/10'");
  await cdp.waitFor("!document.querySelector('.game-detail-host')?.hidden", '深链最后一个游戏');
  check('最后一个游戏禁用下一个', await cdp.evaluate("document.querySelectorAll('.game-detail__pager-button')[1].disabled"), true);
  await pressEscape(cdp);
  await cdp.waitFor("document.querySelector('.game-detail-host')?.hidden", '边界游戏返回列表');

  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 360,
    height: 800,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await cdp.evaluate("location.hash = '#/appendix/f'");
  await cdp.waitFor("document.querySelectorAll('.prose-table').length === 3", '附录 F 表格');
  check('360px 页面无横向滚动', await cdp.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true);
  check('表格容器可横向滚动', await cdp.evaluate("document.querySelectorAll('.prose-table')[0].scrollWidth > document.querySelectorAll('.prose-table')[0].clientWidth"), true);
  check('表格第一列 sticky', await cdp.evaluate("getComputedStyle(document.querySelector('.prose__table td:first-child')).position"), 'sticky');
  check('表格区域可聚焦', await cdp.evaluate("document.querySelectorAll('.prose-table')[0].getAttribute('tabindex')"), '0');
  check('表格区域可访问名称', await cdp.evaluate("document.querySelectorAll('.prose-table')[0].getAttribute('aria-label')"), '周记录表');

  await cdp.evaluate("location.hash = '#/ch/5/game/03'");
  await cdp.waitFor("!document.querySelector('.game-detail-host')?.hidden", '360：详情页');
  check('360 详情页无横向滚动', await cdp.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true);
  check('360 详情页底部导航可见', await cdp.evaluate("document.querySelector('.game-detail__pager').getBoundingClientRect().bottom <= window.innerHeight + 1"), true);

  await cdp.evaluate("location.hash = '#/front'");
  await cdp.waitFor("document.querySelector('.prose-head__title')?.textContent.startsWith('前置')", '前置');
  check('前置无上一页', await cdp.evaluate("document.querySelectorAll('.footer-nav')[0].disabled"), true);
  check('前置小节导航', await cdp.evaluate("[...document.querySelectorAll('.section-nav--desktop .section-nav__button')].map((button) => button.textContent)"), [
    '序　0-3岁，你才是孩子最好的玩具',
    '本书使用说明',
    '0-36个月发展地图',
  ]);

  await cdp.evaluate("document.querySelector('.section-nav--mobile').open = true");
  const mobileSectionId = await cdp.evaluate("document.querySelectorAll('.section-nav--mobile .section-nav__button')[1].dataset.sectionId");
  await cdp.evaluate("document.querySelectorAll('.section-nav--mobile .section-nav__button')[1].click()");
  await cdp.waitFor("document.querySelector('.section-nav--mobile').open === false", '移动端小节导航收起');
  check('移动端小节导航地址不变', await cdp.evaluate('location.hash'), '#/front');
  await cdp.waitFor(`document.getElementById(${JSON.stringify(mobileSectionId)}).getBoundingClientRect().top < 220`, '移动端小节导航滚动');
  check('移动端小节导航滚动位置', await cdp.evaluate(`(() => {
    const top = document.getElementById(${JSON.stringify(mobileSectionId)}).getBoundingClientRect().top;
    return top >= 0 && top < 220;
  })()`), true);

  await cdp.evaluate("location.hash = '#/appendix/f'");
  await cdp.waitFor("document.querySelector('.prose-head__title')?.textContent.startsWith('附录F')", '附录 F');
  check('附录 F 无下一页', await cdp.evaluate("document.querySelectorAll('.footer-nav')[1].disabled"), true);

  await cdp.evaluate("location.hash = '#/ch/99'");
  await cdp.waitFor("document.querySelector('.toc-page') !== null", '非法章号回目录');
  check('非法章号提示', await cdp.evaluate("document.querySelector('#toast').textContent"), '第99章不存在，已回到目录');

  await cdp.send('Emulation.clearDeviceMetricsOverride');
}

async function setViewport(cdp, width, height) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 600,
  });
  await sleep(120);
}

async function runResponsiveChecks(cdp, app) {
  await setViewport(cdp, 768, 1024);
  await cdp.navigate(`${app}/#/`);
  await cdp.waitFor("document.querySelectorAll('.toc-row').length === 28", '768：目录');
  check('768 目录无横向滚动', await cdp.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true);

  await cdp.evaluate("location.hash = '#/appendix/a'");
  await cdp.waitFor("document.querySelectorAll('.prose-table').length > 0", '768：附录 A');
  check('768 文档无横向滚动', await cdp.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true);
  check('768 表格容器可横向滚动', await cdp.evaluate("getComputedStyle(document.querySelector('.prose-table')).overflowX"), 'auto');
  check('768 移动端小节导航可见', await cdp.evaluate("document.querySelector('.prose-nav-host').offsetWidth > 0"), true);
  check('768 桌面小节导航隐藏', await cdp.evaluate("getComputedStyle(document.querySelector('.section-nav--desktop')).display"), 'none');

  await setViewport(cdp, 1440, 900);
  await cdp.navigate(`${app}/#/`);
  await cdp.waitFor("document.querySelectorAll('.toc-row').length === 28", '1440：目录');
  check('1440 目录无横向滚动', await cdp.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true);

  await cdp.evaluate("location.hash = '#/appendix/a'");
  await cdp.waitFor("document.querySelectorAll('.prose-table').length > 0", '1440：附录 A');
  check('1440 文档无横向滚动', await cdp.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true);
  check('1440 表格容器可横向滚动', await cdp.evaluate("getComputedStyle(document.querySelector('.prose-table')).overflowX"), 'auto');
  check('1440 桌面小节导航可见', await cdp.evaluate("document.querySelector('.section-nav--desktop').offsetWidth > 0"), true);
  check('1440 移动端小节导航隐藏', await cdp.evaluate("getComputedStyle(document.querySelector('.prose-nav-host')).display"), 'none');
  check('1440 小节导航 sticky', await cdp.evaluate("getComputedStyle(document.querySelector('.prose-aside')).position"), 'sticky');

  const sectionId = await cdp.evaluate("document.querySelectorAll('.section-nav--desktop .section-nav__button')[1].dataset.sectionId");
  await cdp.evaluate("document.querySelectorAll('.section-nav--desktop .section-nav__button')[1].click()");
  await cdp.waitFor(`document.getElementById(${JSON.stringify(sectionId)}).getBoundingClientRect().top < 220`, '1440：小节导航滚动');
  check('1440 小节导航地址不变', await cdp.evaluate('location.hash'), '#/appendix/a');
  check('1440 小节导航滚动位置', await cdp.evaluate(`(() => {
    const top = document.getElementById(${JSON.stringify(sectionId)}).getBoundingClientRect().top;
    return top >= 0 && top < 220;
  })()`), true);

  await cdp.send('Emulation.clearDeviceMetricsOverride');
}

async function runImageFallbackChecks(cdp, app) {
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.setBlockedURLs', { urls: ['*001-1.jpg'] });
  await cdp.send('Page.navigate', { url: `${app}/?smoke=image#/ch/5` });
  await cdp.waitFor("document.querySelectorAll('.card').length === 10", '图片 404：第 5 章');
  await cdp.waitFor("document.querySelector('.card__fallback') !== null", '图片 404：占位');
  check('图片 404 占位文本', await cdp.evaluate("document.querySelector('.card__fallback').textContent"), '01');
  check('图片 404 卡片高度', await cdp.evaluate("document.querySelector('.card').getBoundingClientRect().height > 100"), true);
  check('图片 404 卡片仍可进详情', await cdp.evaluate("document.querySelector('.card').tagName"), 'BUTTON');
  await cdp.send('Network.setBlockedURLs', { urls: [] });
}

async function runOfflineChecks(cdp, app) {
  await cdp.send('Page.navigate', { url: `${app}/?smoke=offline#/` });
  await cdp.waitFor("document.querySelectorAll('.toc-row').length === 28", '断网：目录');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: true,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });

  await cdp.evaluate("location.hash = '#/appendix/f'");
  await cdp.waitFor("document.querySelector('.state--error') !== null", '断网：错误块');
  check('断网错误标题', await cdp.evaluate("document.querySelector('.state__title').textContent"), '文档加载失败');
  check('断网重试按钮', await cdp.evaluate("document.querySelector('.state__actions .button--primary').textContent"), '重试');

  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  await cdp.evaluate("document.querySelector('.state__actions .button--primary').click()");
  await cdp.waitFor("document.querySelector('.prose-head__title')?.textContent.startsWith('附录F')", '断网：重试成功');
  check('重试后无错误块', await cdp.evaluate("document.querySelector('.state--error') !== null"), false);
}

async function resourceNames(cdp) {
  return cdp.evaluate("performance.getEntriesByType('resource').map((entry) => entry.name)");
}

async function runNetworkChecks(cdp, app) {
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Page.navigate', { url: `${app}/?smoke=network#/` });
  await cdp.waitFor("document.querySelectorAll('.toc-row').length === 28", '网络：目录');

  const first = await resourceNames(cdp);
  check('首屏加载 toc.json', first.some((name) => name.includes('/data/toc.json')), true);
  check('首屏不加载文档 JSON', first.some((name) => /\/data\/(chapters|docs)\//.test(name)), false);

  await cdp.evaluate("location.hash = '#/ch/5'");
  await cdp.waitFor("document.querySelectorAll('.card').length === 10", '网络：第 5 章');
  const chapter = await resourceNames(cdp);
  check('进入第 5 章加载 ch05.json', chapter.some((name) => name.includes('/data/chapters/ch05.json')), true);

  await sleep(1600);
  const prefetched = await resourceNames(cdp);
  check('预取上一章 ch04.json', prefetched.some((name) => name.includes('/data/chapters/ch04.json')), true);
  check('预取下一章 ch06.json', prefetched.some((name) => name.includes('/data/chapters/ch06.json')), true);

  await cdp.send('Page.navigate', { url: `${app}/?prefetch=off#/ch/5` });
  await cdp.waitFor("document.querySelectorAll('.card').length === 10", '网络：关闭预取');
  await sleep(1600);
  const off = await resourceNames(cdp);
  check('关闭预取后不请求相邻章', off.some((name) => /chapters\/ch0[46]\.json/.test(name)), false);
}

async function runSubpathChecks(cdp, app) {
  await cdp.send('Page.navigate', { url: `${app}/#/` });
  await cdp.waitFor("document.querySelectorAll('.toc-row').length === 28", '子目录：目录');
  check('子目录：目录 28 行', await cdp.evaluate("document.querySelectorAll('.toc-row').length"), 28);

  await cdp.evaluate("location.hash = '#/appendix/e'");
  await cdp.waitFor("document.querySelector('.prose-head__title')?.textContent.startsWith('附录E')", '子目录：附录 E');
  check('子目录：深链标题', await cdp.evaluate("document.querySelector('.prose-head__title').textContent"), '附录E 30首亲子儿歌与手指谣');

  await cdp.evaluate("location.hash = '#/ch/5'");
  await cdp.waitFor("document.querySelectorAll('.card').length === 10", '子目录：第 5 章');
  await cdp.waitFor("document.querySelector('.card__art img')?.complete === true", '子目录：插画');
  check('子目录：插画加载', await cdp.evaluate("document.querySelector('.card__art img')?.naturalWidth > 0"), true);
}

async function runPerf(cdp, app) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 360,
    height: 800,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      window.__perf = { before: 0, after: 0, cutoff: Infinity, rowsAt: null, contentAt: null };
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.hadRecentInput) continue;
          if (entry.startTime >= window.__perf.cutoff) window.__perf.after += entry.value;
          else window.__perf.before += entry.value;
        }
      }).observe({ type: 'layout-shift', buffered: true });

      function watch(selector, count, key) {
        const timer = setInterval(() => {
          if (document.querySelectorAll(selector).length >= count && !window.__perf[key]) {
            window.__perf[key] = performance.now();
            window.__perf.after = 0;
            window.__perf.cutoff = performance.now();
            clearInterval(timer);
          }
        }, 10);
      }

      const start = () => {
        if (!document.documentElement) return setTimeout(start, 0);
        watch('.toc-row', 28, 'rowsAt');
        watch('.card', 10, 'contentAt');
        watch('.prose__p', 3, 'contentAt');
        watch('.state--error', 1, 'contentAt');
      };
      start();
    `,
  });

  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  if (SLOW) {
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 40,
      downloadThroughput: 1.5 * 1024 * 1024 / 8,
      uploadThroughput: 750 * 1024 / 8,
    });
  }

  await cdp.send('Page.navigate', { url: `${app}/?smoke=perf#/` });
  await cdp.waitFor('window.__perf?.rowsAt !== null', '性能：目录就绪', 30000);

  const toc = await cdp.evaluate(`(() => {
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    return {
      fcp: fcp ? fcp.startTime : null,
      rows: window.__perf.rowsAt,
      clsBefore: window.__perf.before,
      clsAfter: window.__perf.after,
    };
  })()`);

  let switchMs = null;
  if (!SLOW) {
    await cdp.evaluate("location.hash = '#/ch/5'");
    await cdp.waitFor("document.querySelectorAll('.card').length === 10", '性能：第 5 章');
    await sleep(1600);
    switchMs = await cdp.evaluate(`new Promise((resolve) => {
      const started = performance.now();
      const observer = new MutationObserver(() => {
        const title = document.querySelector('.chapter__title');
        if (title && title.textContent.startsWith('第6章')) {
          observer.disconnect();
          resolve(performance.now() - started);
        }
      });
      observer.observe(document.getElementById('view'), { childList: true, subtree: true, characterData: true });
      document.querySelectorAll('.footer-nav')[1].click();
    })`);
  }

  const chapter = await cdp.evaluate(`(() => {
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    return {
      fcp: fcp ? fcp.startTime : null,
      clsBefore: window.__perf.before,
      clsAfter: window.__perf.after,
    };
  })()`);

  const ms = (value) => (value === null ? 'n/a' : `${value.toFixed(1)} ms`);
  const cls = (value) => value.toFixed(3);
  const network = SLOW ? '4G（40ms 延迟、1.5Mbps）' : '本地';
  console.log(`perf   ${network} · FCP ${ms(toc.fcp)} · 目录可交互 ${ms(toc.rows)} · 缓存命中切页 ${ms(switchMs)}`);
  console.log(`perf   CLS 目录 ${cls(toc.clsAfter)} / 文档 ${cls(chapter.clsAfter)}（从内容出现开始累计）`);
  await cdp.send('Emulation.clearDeviceMetricsOverride');
}

async function main() {
  if (typeof WebSocket === 'undefined') {
    throw new Error('smoke 需要 Node 22+（global WebSocket）');
  }
  const chrome = findChrome();
  if (!chrome) {
    console.log('! 未找到 Chrome，跳过 smoke。设置 CHROME=/path/to/chrome 后重试。');
    return;
  }

  const server = await startServer();
  const subServer = await startServer({ mount: '/babyGame/' });
  const app = `http://127.0.0.1:${server.address().port}`;
  const subApp = `http://127.0.0.1:${subServer.address().port}/babyGame`;
  const profile = mkdtempSync(join(tmpdir(), 'babygame-smoke-'));
  let chromeProcess = null;
  let cdp = null;

  try {
    const launched = await launchChrome(chrome, profile);
    chromeProcess = launched.child;
    const target = await pageTarget(launched.port);
    cdp = await Cdp.connect(target.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');

    await runChecks(cdp, app);
    await runResponsiveChecks(cdp, app);
    await runImageFallbackChecks(cdp, app);
    await runOfflineChecks(cdp, app);
    await runNetworkChecks(cdp, app);
    await runSubpathChecks(cdp, subApp);
    if (PERF) await runPerf(cdp, app);
  } finally {
    cdp?.close();
    chromeProcess?.kill('SIGKILL');
    server.close();
    subServer.close();
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {
      // Chrome 可能还在释放 profile，留给系统临时目录清理。
    }
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} 项失败`);
    process.exit(1);
  }
  console.log(`\n全部通过（${checkCount} 项）`);
}

main().catch((error) => {
  console.error(`✗ ${error.message}`);
  process.exit(1);
});
