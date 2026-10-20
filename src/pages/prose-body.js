import { el } from '../core/dom.js';
import { createLocalStore } from '../core/local-store.js';
import {
  checklistStorageKey,
  collectChecklistItems,
  decodeChecklistState,
  encodeChecklistState,
  sanitizeChecklistKeys,
  toggleChecklistKey,
} from '../domain/checklist.js';
import { docHeading, docPartLabel } from '../domain/format.js';
import { createBlocks } from '../ui/blocks.js';
import { createSectionNav } from '../ui/section-nav.js';

function prefersReducedMotion() {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/**
 * 文字章正文：页头、小节导航、块列表、页内清单状态。
 * 清单原始字符串存在 localStorage；键格式与编码都在 domain。
 */
export function createProseBody() {
  const part = el('p', { class: 'prose-head__part' });
  const title = el('h1', { class: 'prose-head__title', tabindex: '-1' });
  const meta = el('p', { class: 'prose-head__meta' });
  const reset = el('button', {
    type: 'button',
    class: 'button button--ghost prose-head__reset',
    hidden: true,
    'aria-label': '重置本文档的清单勾选',
    onclick: () => resetChecklist(),
  }, ['重置本页勾选']);
  const header = el('header', { class: 'prose-head' }, [part, title, meta, reset]);
  const navHost = el('div', { class: 'prose-nav-host' });
  const article = el('article', { class: 'prose' });
  const aside = el('aside', { class: 'prose-aside' });
  const layout = el('div', { class: 'prose-layout' }, [article, aside]);
  const root = el('div', { class: 'prose-page' }, [header, navHost, layout]);
  const localStore = createLocalStore();

  let docId = '';
  let keys = new Set();
  let mobileNav = null;

  function readKeys(doc) {
    const raw = localStore.read(checklistStorageKey(doc.id));
    if (raw === null) {
      // 没有本地状态时，稿件里的 checked 只是默认值。
      return new Set(
        collectChecklistItems(doc.blocks)
          .filter((item) => item.checked)
          .map((item) => item.key),
      );
    }
    return sanitizeChecklistKeys(decodeChecklistState(raw), doc.blocks);
  }

  function resetChecklist() {
    if (!docId) return;
    localStore.write(checklistStorageKey(docId), null);
    keys = new Set();
    article.querySelectorAll('input[type="checkbox"]').forEach((box) => {
      box.checked = false;
    });
  }

  function scrollToSection(id) {
    const target = article.querySelector(`[id="${id}"]`);
    if (!target) return;
    target.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    if (mobileNav?.open) mobileNav.open = false;
  }

  return {
    el: root,
    kind: 'prose',

    update({ doc, toc }) {
      if (doc.id === docId) return;
      docId = doc.id;
      keys = readKeys(doc);
      part.textContent = docPartLabel(doc, toc?.groups);
      title.textContent = docHeading(doc);
      meta.textContent = doc.meta;

      const nav = createSectionNav(doc.sections, { onSelect: scrollToSection });
      mobileNav = nav.mobile;
      navHost.replaceChildren(nav.mobile);
      aside.replaceChildren(nav.desktop);

      article.replaceChildren(createBlocks(doc.blocks, {
        sections: doc.sections,
        checkedKeys: keys,
        onToggle(key, checked) {
          keys = toggleChecklistKey(keys, key, checked);
          localStore.write(checklistStorageKey(doc.id), encodeChecklistState(keys));
        },
      }));

      // 清单项在块结构里，重置按钮只对含清单的文档可见。
      reset.hidden = collectChecklistItems(doc.blocks).length === 0;
    },

    focusTitle: () => title.focus({ preventScroll: true }),
    destroy() {},
  };
}
