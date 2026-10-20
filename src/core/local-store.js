function safeStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * localStorage 的极薄适配：只读写字符串，失败静默降级。
 * 键格式与值编码由调用方决定，core 不碰业务规则。
 */
export function createLocalStore({ storage = safeStorage() } = {}) {
  return {
    read(key) {
      if (!storage) return null;
      try {
        return storage.getItem(key);
      } catch {
        return null;
      }
    },

    write(key, value) {
      if (!storage) return;
      try {
        if (value === null) storage.removeItem(key);
        else storage.setItem(key, value);
      } catch {
        // 配额或隐私模式失败：本次会话内仍可勾选，刷新后丢失。
      }
    },
  };
}
