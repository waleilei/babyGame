import { el } from '../core/dom.js';
import { checklistKey } from '../domain/checklist.js';

/**
 * 行内标记只支持 `**粗体**`；`\n` 渲染为块内换行。
 * 数据由构建期校验，这里只负责安全地建节点。
 */
export function inline(text) {
  const fragment = document.createDocumentFragment();
  String(text ?? '').split('\n').forEach((line, lineIndex) => {
    if (lineIndex > 0) fragment.append(el('br'));
    line.split('**').forEach((part, index) => {
      if (!part) return;
      fragment.append(index % 2 === 1 ? el('strong', { text: part }) : document.createTextNode(part));
    });
  });
  return fragment;
}

function createTable(block, label) {
  const table = el('table', { class: 'prose__table' });
  const headRow = el('tr');
  for (const cell of block.head) {
    headRow.append(el('th', { scope: 'col' }, [inline(cell)]));
  }
  table.append(el('thead', {}, [headRow]));

  const body = el('tbody');
  for (const row of block.rows) {
    const tr = el('tr');
    for (const cell of row) {
      tr.append(el('td', { class: cell ? 'prose__cell' : 'prose__cell is-empty' }, cell ? [inline(cell)] : []));
    }
    body.append(tr);
  }
  table.append(body);

  return el('div', {
    class: 'prose-table',
    role: 'region',
    tabindex: '0',
    'aria-label': label,
  }, [table]);
}

function createChecklist(block, blockIndex, { checkedKeys, onToggle }) {
  const list = el('ul', {
    class: 'prose__checklist',
    'aria-label': `可勾选清单，共 ${block.items.length} 项`,
  });

  block.items.forEach((item, itemIndex) => {
    const key = checklistKey(blockIndex, itemIndex);
    const box = el('input', {
      type: 'checkbox',
      class: 'checklist__box',
      checked: checkedKeys.has(key),
      onchange: (event) => onToggle?.(key, event.target.checked),
    });
    list.append(el('li', { class: 'checklist__item' }, [
      el('label', { class: 'checklist__label' }, [
        box,
        el('span', { class: 'checklist__text' }, [inline(item.text)]),
      ]),
    ]));
  });

  return list;
}

/**
 * 渲染文字章的正文档列。标题 id 与 doc.sections 一一对应。
 */
export function createBlocks(blocks, { sections = [], checkedKeys = new Set(), onToggle = null } = {}) {
  const fragment = document.createDocumentFragment();
  let sectionIndex = 0;
  let lastHeading = '';

  blocks.forEach((block, blockIndex) => {
    switch (block.type) {
      case 'p':
        fragment.append(el('p', { class: 'prose__p' }, [inline(block.text)]));
        break;

      case 'h2':
      case 'h3':
      case 'h4': {
        const section = sections[sectionIndex];
        sectionIndex += 1;
        lastHeading = block.text;
        fragment.append(el(block.type, {
          class: `prose__${block.type}`,
          id: section?.id ?? null,
          tabindex: '-1',
        }, [inline(block.text)]));
        break;
      }

      case 'ul':
      case 'ol': {
        const list = el(block.type, {
          class: `prose__${block.type}`,
          ...(block.type === 'ol' ? { start: block.start } : {}),
        });
        for (const item of block.items) list.append(el('li', {}, [inline(item)]));
        fragment.append(list);
        break;
      }

      case 'quote':
        fragment.append(el('blockquote', { class: 'prose__quote' }, [inline(block.text)]));
        break;

      case 'table':
        fragment.append(createTable(block, lastHeading || '数据表'));
        break;

      case 'checklist':
        fragment.append(createChecklist(block, blockIndex, { checkedKeys, onToggle }));
        break;

      case 'hr':
        fragment.append(el('hr', { class: 'prose__hr' }));
        break;

      default:
        break;
    }
  });

  return fragment;
}
