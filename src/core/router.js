const TOC_HASHES = new Set(['', '#', '#/']);
const DOC_HASH_PATTERN = /^#\/ch\/(\d+)(?:\/game\/(\d{1,3}))?\/?$/;
const APPENDIX_HASH_PATTERN = /^#\/appendix\/([a-zA-Z])\/?$/;

export function normalizeGameId(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '');
  const value = Number(digits);
  if (!digits || !Number.isInteger(value) || value <= 0 || value > 999) return null;
  return String(value).padStart(2, '0');
}

function chapterDocId(no) {
  return `ch${String(no).padStart(2, '0')}`;
}

function chapterNoFromDocId(docId) {
  const match = /^ch(\d+)$/.exec(String(docId ?? ''));
  return match ? Number(match[1]) : null;
}

export function parseHash(hash) {
  const value = String(hash ?? '').trim();
  if (TOC_HASHES.has(value)) return { name: 'toc' };

  if (/^#\/front\/?$/.test(value)) return { name: 'doc', docId: 'front', gameId: null };

  const appendix = APPENDIX_HASH_PATTERN.exec(value);
  if (appendix) return { name: 'doc', docId: `apx-${appendix[1].toLowerCase()}`, gameId: null };

  const match = DOC_HASH_PATTERN.exec(value);
  if (!match) return null;

  const chapterNo = Number(match[1]);
  if (!Number.isInteger(chapterNo) || chapterNo <= 0) return null;

  const gameId = match[2] ? normalizeGameId(match[2]) : null;
  if (match[2] && !gameId) return null;

  return { name: 'doc', docId: chapterDocId(chapterNo), gameId };
}

export function buildHash(route) {
  if (!route || route.name === 'toc') return '#/';

  const { docId, gameId } = route;
  if (docId === 'front') return '#/front';

  const appendix = /^apx-([a-f])$/.exec(String(docId ?? ''));
  if (appendix) return `#/appendix/${appendix[1]}`;

  const no = chapterNoFromDocId(docId);
  if (!no) return '#/';
  return gameId ? `#/ch/${no}/game/${gameId}` : `#/ch/${no}`;
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
