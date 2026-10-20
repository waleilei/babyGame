import { clear, el } from '../core/dom.js';

function media(src, alt, { class: className = 'media', fallback = '插图暂缺', lazy = false } = {}) {
  const wrap = el('div', { class: className });
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
  el('h3', { class: 'detail-section__label', text: label }),
  content,
]);

const card = (label, text) => el('div', { class: 'detail-card' }, [
  el('h4', { class: 'detail-card__title', text: label }),
  el('p', { text }),
]);

const fact = (label, value) => el('div', { class: 'fact' }, [
  el('dt', { class: 'fact__label', text: label }),
  el('dd', { class: 'fact__value', text: value }),
]);

export function createGameDialog({ onRequestClose }) {
  let suppressClose = false;

  const closeButton = el('button', {
    type: 'button',
    class: 'game-dialog__close',
    'aria-label': '关闭游戏详情',
    onclick: () => requestClose(),
  }, ['×']);

  const title = el('h2', { class: 'game-dialog__title', id: 'game-dialog-title' });
  const meta = el('p', { class: 'game-dialog__meta' });
  const body = el('div', { class: 'game-dialog__body' });
  const dialog = el('dialog', { class: 'game-dialog', 'aria-labelledby': 'game-dialog-title' }, [
    el('div', { class: 'game-dialog__panel' }, [
      el('header', { class: 'game-dialog__bar' }, [
        el('div', { class: 'game-dialog__heading' }, [
          el('p', { class: 'game-dialog__eyebrow', text: '游戏详情' }),
          title,
          meta,
        ]),
        closeButton,
      ]),
      body,
    ]),
  ]);

  function render(game) {
    title.textContent = game.name;
    meta.textContent = `${game.id} · ${game.age} · ${game.ability} · ${game.duration}`;
    clear(body);

    const steps = el('ol', { class: 'steps' });
    game.steps.forEach((step) => steps.append(el('li', {}, [el('span', { text: step })])));

    const panels = el('div', { class: 'panels' });
    game.art.panels.forEach((src, index) => {
      panels.append(media(src, `${game.name}步骤图 ${index + 1}`, { class: 'panel', lazy: true }));
    });

    const observe = el('ul', { class: 'observations' });
    game.observe.forEach((item) => observe.append(el('li', { text: item })));

    body.append(
      media(game.art.main, `${game.name}示意图`, { class: 'game-dialog__hero' }),
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

  function close() {
    if (!dialog.open) return;
    suppressClose = true;
    dialog.close();
  }

  function requestClose() {
    if (!dialog.open) return;
    close();
    onRequestClose?.();
  }

  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    requestClose();
  });

  dialog.addEventListener('close', () => {
    if (suppressClose) {
      suppressClose = false;
      return;
    }
    onRequestClose?.();
  });

  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) requestClose();
  });

  return {
    el: dialog,

    open(game) {
      render(game);
      if (!dialog.open) {
        dialog.showModal();
        body.scrollTop = 0;
        closeButton.focus();
      }
    },

    close,
    destroy: close,
    isOpen: () => dialog.open,
  };
}
