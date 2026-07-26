// 訊息三點選單：建立、依可用空間定位（menuPosition.js）、點擊外部關閉。
// 同一時間只允許一個選單存在，開新選單前會先關掉前一個。

import { positionMenu } from './menuPosition.js';

let dismissOpenMenu = null;

export function showMessageMenu(anchorBtn, messageId, { onDelete, onEdit } = {}) {
  if (dismissOpenMenu) dismissOpenMenu();

  const menu = document.createElement('div');
  menu.className = 'message-menu';

  function dismissMenu() {
    menu.remove();
    document.removeEventListener('click', closeMenu);
    dismissOpenMenu = null;
  }
  dismissOpenMenu = dismissMenu;

  const editOption = document.createElement('div');
  editOption.className = 'message-menu-item';
  editOption.textContent = '✏️ 編輯';
  editOption.addEventListener('click', () => {
    dismissMenu();
    if (onEdit) {
      onEdit(messageId);
    } else {
      console.log(`✏️ [messageMenu.js] 編輯訊息（尚未實作）: messageId=${messageId}`);
    }
  });

  const deleteOption = document.createElement('div');
  deleteOption.className = 'message-menu-item';
  deleteOption.textContent = '🗑️ 刪除';
  deleteOption.addEventListener('click', async () => {
    dismissMenu();
    if (confirm('確定要刪除這條訊息嗎？\n該訊息之後的所有對話（包含 AI 回覆）也會一併刪除。')) {
      await onDelete(messageId);
    }
  });

  menu.appendChild(editOption);
  menu.appendChild(deleteOption);

  menu.style.position = 'fixed';
  menu.style.visibility = 'hidden';
  document.body.appendChild(menu);
  positionMenu(menu, anchorBtn);
  menu.style.visibility = '';

  setTimeout(() => {
    document.addEventListener('click', closeMenu);
  }, 0);

  function closeMenu(e) {
    if (!menu.contains(e.target) && e.target !== anchorBtn) {
      dismissMenu();
    }
  }
}
