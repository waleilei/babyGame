export function checklistKey(blockIndex, itemIndex) {
  return `${blockIndex}:${itemIndex}`;
}

export function checklistStorageKey(docId) {
  return `babyGame:checklist:${docId}`;
}

export function parseChecklistKey(key) {
  const match = /^(\d+):(\d+)$/.exec(String(key ?? ''));
  if (!match) return null;
  return { blockIndex: Number(match[1]), itemIndex: Number(match[2]) };
}

export function decodeChecklistState(raw) {
  const keys = new Set();
  if (!raw) return keys;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return keys;
  }
  if (!Array.isArray(parsed)) return keys;

  for (const key of parsed) {
    if (parseChecklistKey(key)) keys.add(key);
  }
  return keys;
}

export function encodeChecklistState(keys) {
  const sorted = [...keys].sort((a, b) => {
    const left = parseChecklistKey(a);
    const right = parseChecklistKey(b);
    if (!left || !right) return 0;
    return left.blockIndex - right.blockIndex || left.itemIndex - right.itemIndex;
  });
  return JSON.stringify(sorted);
}

/** 把块结构展开成可勾选项，key 为“块索引:项索引”。 */
export function collectChecklistItems(blocks) {
  const items = [];
  (blocks ?? []).forEach((block, blockIndex) => {
    if (block?.type !== 'checklist') return;
    (block.items ?? []).forEach((item, itemIndex) => {
      items.push({
        key: checklistKey(blockIndex, itemIndex),
        blockIndex,
        itemIndex,
        text: item.text,
        checked: Boolean(item.checked),
      });
    });
  });
  return items;
}

/** 丢弃越界或未知的存储键，块结构变化不会让页面崩溃。 */
export function sanitizeChecklistKeys(keys, blocks) {
  const valid = new Set(collectChecklistItems(blocks).map((item) => item.key));
  const result = new Set();
  for (const key of keys ?? []) {
    if (valid.has(key)) result.add(key);
  }
  return result;
}

export function toggleChecklistKey(keys, key, checked) {
  const next = new Set(keys ?? []);
  if (checked) next.add(key);
  else next.delete(key);
  return next;
}
