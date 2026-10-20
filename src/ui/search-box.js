import { el } from '../core/dom.js';
import { resultCountLabel } from '../domain/format.js';

export function createSearchBox({ onInput, onClear }) {
  const input = el('input', {
    type: 'search',
    class: 'search__input',
    id: 'catalog-search',
    name: 'catalog-search',
    placeholder: '搜索游戏、章节或附录，例如“躲猫猫”“里程碑”',
    'aria-label': '搜索游戏、章节与附录',
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
    setDisabled(disabled) {
      input.disabled = disabled;
      clearButton.disabled = disabled;
    },
    clear() {
      input.value = '';
      update({ resultCount: 0 });
    },
  };
}
