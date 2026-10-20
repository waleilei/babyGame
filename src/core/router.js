const TOC_HASHES = new Set(['', '#', '#/']);

export function normalizeGameId(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '');
  const value = Number(digits);
  if (!digits || !Number.isInteger(value) || value <= 0 || value > 999) return null;
  return String(value).padStart(2, '0');
}

export function parseHash(hash) {
  const value = String(hash ?? '').trim();
  if (TOC_HASHES.has(value)) return { name: 'toc' };

  const match = /^#\/ch\/(\d+)(?:\/game\/(\d{1,3}))?\/?$/.exec(value);
  if (!match) return null;

  const chapterNo = Number(match[1]);
  if (!Number.isInteger(chapterNo) || chapterNo <= 0) return null;

  const gameId = match[2] ? normalizeGameId(match[2]) : null;
  if (match[2] && !gameId) return null;

  return { name: 'chapter', chapterNo, gameId };
}

export function buildHash(route) {
  if (!route || route.name === 'toc') return '#/';
  return route.gameId ? `#/ch/${route.chapterNo}/game/${route.gameId}` : `#/ch/${route.chapterNo}`;
}

export function createRouter({ onRoute }) {
  const handle = () => onRoute(parseHash(window.location.hash));

  return {
    start() {
      window.addEventListener('hashchange', handle);
      if (!window.location.hash) window.history.replaceState(null, '', '#/');
      handle();
    },

    navigate(route, { replace = false } = {}) {
      const hash = buildHash(route);
      if (window.location.hash === hash) return;
      if (replace) {
        window.history.replaceState(null, '', hash);
        handle();
      } else {
        window.location.hash = hash;
      }
    },
  };
}
