import { el } from '../core/dom.js';
import { resultCountLabel } from '../domain/format.js';

export function createSearchBox({ onInput, onClear }) {
  const input = el('input', {
    type: 'search',
    class: 'search__input',
    id: 'game-search',
    name: 'game-search',
    placeholder: '搜索游戏名，例如“躲猫猫”',
    'aria-label': '按游戏名搜索',
    autocomplete: 'off',
    spellcheck: 'false',
    oninput: (event) => onInput(event.target.value),
  });

  const clearButton = el('button', {
    type: 'button',
    class: 'search__clear',
    onclick: () => {
      input.focus();
      onClear();
    },
  }, ['清除']);

  const count = el('p', { class: 'search__count', 'aria-live': 'polite', 'aria-atomic': 'true' });

  function update({ resultCount = 0 } = {}) {
    const hasQuery = input.value.trim().length > 0;
    clearButton.hidden = !hasQuery;
    count.textContent = hasQuery ? resultCountLabel(resultCount) : '';
  }

  update();

  return {
    el: el('div', { class: 'search' }, [
      el('div', { class: 'search__field' }, [input, clearButton]),
      count,
    ]),
    input,
    update,
    clear() {
      input.value = '';
      update({ resultCount: 0 });
    },
  };
}
