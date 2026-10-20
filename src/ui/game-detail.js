import { clear, el } from '../core/dom.js';
import { artAlt, zoomButtonLabel } from '../domain/format.js';

function media(src, alt, { class: className, lazy = false, zoomLabel, fallback = '插图暂缺' }) {
  const wrap = el('button', {
    type: 'button',
    class: `${className} media--zoom`,
    'aria-label': zoomLabel,
  });
  const image = el('img', { src, alt, decoding: 'async', loading: lazy ? 'lazy' : null });
  image.addEventListener('error', () => {
    image.remove();
    wrap.classList.add('is-fallback');
    wrap.append(el('span', { class: 'media__fallback', 'aria-hidden': 'true', text: fallback }));
  }, { once: true });
  wrap.append(image);
  return wrap;
}

const section = (label, content) => el('section', { class: 'detail-section' }, [
  el('h2', { class: 'detail-section__label', text: label }),
  content,
]);

const card = (label, text) => el('div', { class: 'detail-card' }, [
  el('h3', { class: 'detail-card__title', text: label }),
  el('p', { text }),
]);

const fact = (label, value) => el('div', { class: 'fact' }, [
  el('dt', { class: 'fact__label', text: label }),
  el('dd', { class: 'fact__value', text: value }),
]);

const pad = (value) => String(value).padStart(2, '0');

/**
 * 游戏详情页：全屏文档流视图。
 * 头部（返回 + 标题 + 位置）、8 模块正文与步骤图、底部上/下一个游戏。
 */
export function createGameDetail({ onBack, onSwitchGame, onZoomImage }) {
  let currentGameId = null;
  let prevTarget = null;
  let nextTarget = null;

  const backButton = el('button', {
    type: 'button',
    class: 'game-detail__back',
    onclick: () => onBack(),
  }, [
    el('span', { 'aria-hidden': 'true', text: '←' }),
    el('span', { text: '返回列表' }),
  ]);

  const eyebrow = el('p', { class: 'game-detail__eyebrow', text: '游戏详情' });
  const title = el('h1', { class: 'game-detail__title', tabindex: '-1' });
  const location = el('p', { class: 'game-detail__location' });
  const meta = el('p', { class: 'game-detail__meta' });
  const body = el('div', { class: 'game-detail__body' });

  const prevButton = el('button', {
    type: 'button',
    class: 'game-detail__pager-button',
    onclick: () => {
      if (prevTarget) onSwitchGame(prevTarget.id);
    },
  }, ['← 上一个']);
  const nextButton = el('button', {
    type: 'button',
    class: 'game-detail__pager-button',
    onclick: () => {
      if (nextTarget) onSwitchGame(nextTarget.id);
    },
  }, ['下一个 →']);

  function renderBody(game) {
    clear(body);

    const steps = el('ol', { class: 'steps' });
    game.steps.forEach((step) => steps.append(el('li', {}, [el('span', { text: step })])));

    const panels = el('div', { class: 'panels' });
    game.art.panels.forEach((src, index) => {
      const button = media(src, artAlt(game, index), {
        class: 'panel',
        lazy: true,
        zoomLabel: zoomButtonLabel(game, index),
      });
      button.addEventListener('click', () => onZoomImage(game, index, button));
      panels.append(button);
    });

    const hero = media(game.art.main, artAlt(game), {
      class: 'game-detail__hero',
      zoomLabel: zoomButtonLabel(game),
    });
    hero.addEventListener('click', () => onZoomImage(game, 0, hero));

    const observe = el('ul', { class: 'observations' });
    game.observe.forEach((item) => observe.append(el('li', { text: item })));

    body.append(
      hero,
      el('dl', { class: 'facts' }, [
        fact('场地', game.place),
        fact('材料', game.materials),
        fact('人数', game.people),
      ]),
      section('玩', el('p', { class: 'detail-text', text: game.play })),
      section('步骤', steps),
      section('步骤图', panels),
      section('观察', observe),
      section('进阶与降阶', el('div', { class: 'split' }, [
        card('进阶', game.up),
        card('降阶', game.down),
      ])),
      section('安全', el('div', { class: 'safety' }, [el('p', { text: game.safety })])),
      section('问', el('div', { class: 'question' }, [el('p', { text: game.question })])),
    );
  }

  const root = el('section', { class: 'game-detail' }, [
    el('header', { class: 'game-detail__bar' }, [
      backButton,
      el('div', { class: 'game-detail__heading' }, [eyebrow, title, location, meta]),
    ]),
    body,
    el('footer', { class: 'game-detail__pager' }, [prevButton, nextButton]),
  ]);

  return {
    el: root,

    update({ game, gameIndex, gameCount, chapterLabel, prev, next }) {
      if (game.id !== currentGameId) {
        currentGameId = game.id;
        renderBody(game);
      }
      prevTarget = prev;
      nextTarget = next;

      title.textContent = game.name;
      location.textContent = `${chapterLabel} · ${pad(gameIndex)}/${pad(gameCount)}`;
      meta.textContent = `${game.age} · ${game.ability} · ${game.duration}`;

      prevButton.disabled = !prev;
      nextButton.disabled = !next;
      prevButton.setAttribute('aria-label', prev ? `上一个游戏：${prev.name}` : '已经是本章第一个游戏');
      nextButton.setAttribute('aria-label', next ? `下一个游戏：${next.name}` : '已经是本章最后一个游戏');
    },

    focusTitle: () => title.focus({ preventScroll: true }),
    destroy() {},
  };
}
