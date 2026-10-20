let timer = null;

export function showToast(message) {
  const node = document.getElementById('toast');
  if (!node) return;
  node.textContent = message;
  node.classList.add('is-visible');
  clearTimeout(timer);
  timer = setTimeout(() => {
    node.classList.remove('is-visible');
    node.textContent = '';
  }, 4000);
}
