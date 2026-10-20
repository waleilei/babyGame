import { el } from '../core/dom.js';
import { errorMessage } from '../domain/format.js';

const block = (name) => el('div', { class: `skeleton skeleton--${name}` });

export function createSkeleton(kind = 'toc') {
  const root = el('div', {
    class: `state state--loading skeleton-block skeleton-block--${kind}`,
    role: 'status',
    'aria-live': 'polite',
    'aria-busy': 'true',
  }, [el('span', { class: 'visually-hidden', text: kind === 'toc' ? '正在加载目录' : '正在加载章节' })]);

  if (kind === 'toc') {
    root.append(
      block('hero'),
      block('label'),
      ...Array.from({ length: 4 }, () => block('row')),
      block('label'),
      ...Array.from({ length: 3 }, () => block('row')),
    );
  } else {
    root.append(
      block('title'),
      block('text'),
      block('intro'),
      el('div', { class: 'skeleton-grid' }, Array.from({ length: 6 }, () => block('card'))),
    );
  }
  return root;
}

export function createErrorBlock({ title, error, onRetry, onHome }) {
  const actions = [];
  if (onRetry && error?.retryable !== false) {
    actions.push(el('button', { type: 'button', class: 'button button--primary', onclick: onRetry }, ['重试']));
  }
  if (onHome) {
    actions.push(el('button', { type: 'button', class: 'button button--ghost', onclick: onHome }, ['回到目录']));
  }

  return el('section', { class: 'state state--error', role: 'alert' }, [
    el('h2', { class: 'state__title', text: title }),
    el('p', { class: 'state__text', text: errorMessage(error) }),
    actions.length > 0 ? el('div', { class: 'state__actions' }, actions) : null,
  ]);
}
