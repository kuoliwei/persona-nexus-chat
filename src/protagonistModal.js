// 主人公人設彈窗：開啟時載入既有設定、儲存時 PUT 回後端。
// 可及性：role="dialog"/aria-modal 由 index.html 靜態標記；本模組負責焦點管理與 Escape 關閉。

import * as api from './api.js';
import { showToast } from './toast.js';

export function initProtagonistModal({ getConversationId, getToken }) {
  const protagonistBtn = document.getElementById('protagonistBtn');
  const protagonistModal = document.getElementById('protagonistModal');
  const protagonistCloseBtn = document.getElementById('protagonistCloseBtn');
  const protagonistSaveBtn = document.getElementById('protagonistSaveBtn');
  const protagonistNameInput = document.getElementById('protagonistNameInput');
  const protagonistBackgroundInput = document.getElementById('protagonistBackgroundInput');

  function closeModal() {
    protagonistModal.classList.add('hidden');
    document.removeEventListener('keydown', onKeydown);
    protagonistBtn.focus();
  }

  function onKeydown(e) {
    if (e.key === 'Escape') closeModal();
  }

  async function openModal() {
    const conversationId = getConversationId();
    if (!conversationId) {
      showToast('聊天室尚未就緒');
      return;
    }

    protagonistModal.classList.remove('hidden');
    document.addEventListener('keydown', onKeydown);
    protagonistNameInput.focus();

    try {
      console.log(`👤 [protagonistModal.js] 載入主人公人設: conversationId=${conversationId}`);
      const res = await api.fetchProtagonist(conversationId, getToken());

      if (res.ok) {
        const data = await res.json();
        protagonistNameInput.value = data.protagonistName || '';
        protagonistBackgroundInput.value = data.protagonistBackground || '';
        console.log(`✅ [protagonistModal.js] 主人公人設已載入: 名稱=${data.protagonistName || '(空)'}, 背景=${(data.protagonistBackground || '').length} 字`);
      } else {
        console.error(`❌ [protagonistModal.js] 載入主人公人設失敗: ${res.status}`);
        showToast('載入主人公人設失敗');
      }
    } catch (error) {
      console.error('❌ [protagonistModal.js] 載入主人公人設異常:', error);
      showToast('載入主人公人設失敗');
    }
  }

  protagonistBtn.addEventListener('click', openModal);

  protagonistCloseBtn.addEventListener('click', closeModal);
  protagonistModal.addEventListener('click', (e) => {
    if (e.target === protagonistModal) closeModal();
  });

  protagonistSaveBtn.addEventListener('click', async () => {
    const conversationId = getConversationId();
    if (!conversationId) {
      showToast('聊天室尚未就緒');
      return;
    }

    const protagonistName = protagonistNameInput.value.trim();
    const protagonistBackground = protagonistBackgroundInput.value.trim();

    protagonistSaveBtn.disabled = true;
    protagonistSaveBtn.textContent = '儲存中...';

    try {
      console.log(`👤 [protagonistModal.js] 儲存主人公人設: 名稱=${protagonistName || '(空)'}, 背景=${protagonistBackground.length} 字`);
      const res = await api.saveProtagonist(conversationId, protagonistName, protagonistBackground, getToken());

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error(`❌ [protagonistModal.js] 儲存主人公人設失敗: ${res.status}`);
        showToast(data.message || `儲存失敗（${res.status}）`);
        return;
      }

      console.log('✅ [protagonistModal.js] 主人公人設已儲存');
      closeModal();
      showToast('主人公人設已儲存');
    } catch (error) {
      console.error('❌ [protagonistModal.js] 儲存主人公人設異常:', error);
      showToast(`儲存失敗: ${error.message}`);
    } finally {
      protagonistSaveBtn.disabled = false;
      protagonistSaveBtn.textContent = '儲存';
    }
  });

  return { open: openModal };
}
