
export function createInitialState(route = { name: 'toc' }) {
  return {
    route,
    toc: { status: 'idle', data: null, error: null },
    docs: {},
    query: '',
  };
}
