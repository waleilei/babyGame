/**
 * 统一的 dialog 关闭纪律。
 *
 * 两个 dialog 处理的是同一套流程：程序化关闭不能回触发 onUserClose，用户主动关闭
 * （Esc、点背景、× 按钮）必须回触发。浏览器会在 Esc 时先派发 cancel，程序化 close()
 * 又会派发 close，两者叠在一起就很容易写成互相递归的状态机。抑制标志与 preventDefault
 * 因此只放在这里一份。
 *
 * @param {HTMLDialogElement} dialog
 * @param {() => void} onUserClose 用户主动关闭后调用；它负责真正关闭（通常调用返回的 close）
 * @returns {() => void} 程序化关闭；不回触发 onUserClose
 */
export function bindDialogClose(dialog, onUserClose) {
  let suppressing = false;

  function close() {
    if (!dialog.open) return;
    suppressing = true;
    dialog.close();
  }

  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    onUserClose();
  });

  dialog.addEventListener('close', () => {
    if (suppressing) {
      suppressing = false;
      return;
    }
    onUserClose();
  });

  return close;
}
