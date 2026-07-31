import { createVirtualMessageList } from './virtualMessageList.js';
import { showMessageMenu } from './messageMenu.js';
import { initProtagonistModal } from './protagonistModal.js';
import { getToken, getConversationId, setConversationId } from './session.js';
import { formatMessageText } from './messageFormatter.js';
import { createMessageStore } from './messageStore.js';
import { createAiResponsePoller } from './aiResponsePoller.js';
import { createMessageSender } from './messageSender.js';
import { createConversationManager } from './conversationManager.js';
import * as api from './api.js';

// chat.js 是協調層：查詢 DOM、建立各業務模組實例並接線（wiring）、綁定事件。
// 業務邏輯（訊息狀態、發送、AI 輪詢、聊天室生命週期）都在各自的模組內，
// 這裡不重複實作，只負責把使用者操作分派給對應模組。
export async function initChat(characterId) {

  console.log('📡 [chat.js] 初始化聊天室，characterId:', characterId);

  const messageInput = document.getElementById('messageInput');
  const sendBtn = document.getElementById('sendBtn');
  const messagesList = document.getElementById('messagesList');
  const restartBtn = document.getElementById('restartBtn');
  const refreshBtn = document.getElementById('refreshBtn');
  const characterNameEl = document.getElementById('characterName');
  const characterStatusEl = document.getElementById('characterStatus');
  const initializingOverlay = document.getElementById('initializingOverlay');
  const initializingMessage = document.getElementById('initializingMessage');

  const token = getToken();
  const store = createMessageStore();
  // 虛擬滾動實例（首次 renderMessages 時建立）
  let vlist = null;

  // 顯示初始化懸浮層，禁用輸入
  function showInitializing(message = '聊天室準備中...') {
    initializingOverlay.classList.remove('hidden');
    initializingMessage.textContent = message;
    messageInput.disabled = true;
    sendBtn.disabled = true;
  }

  // 隱藏初始化懸浮層，啟用輸入
  function hideInitializing() {
    initializingOverlay.classList.add('hidden');
    messageInput.disabled = false;
    sendBtn.disabled = false;
  }

  // 禁用/啟用輸入區（供各業務模組透過回呼觸發，不讓模組直接碰 DOM）
  function setInputLock(locked) {
    messageInput.disabled = locked;
    sendBtn.disabled = locked;
  }

  function getCharacterName() {
    return characterNameEl.textContent;
  }

  // 單條訊息的 HTML 模板（供虛擬滾動模組逐項渲染）
  // 用戶訊息旁加三點選單按鈕（臨時訊息 temp_ 還沒存入 DB，不顯示選單）
  function renderMessageItemHTML(msg) {
    return `
      <div class="message ${msg.role === 'user' ? 'user' : 'bot'}">
        ${msg.role !== 'user' ? '<div class="message-avatar"></div>' : ''}
        ${msg.role === 'user' && !String(msg.id).startsWith('temp_')
          ? `<button class="message-menu-btn" data-message-id="${msg.id}" title="更多選項" aria-label="訊息選項">⋮</button>`
          : ''}
        <div class="message-content">${formatMessageText(msg.text)}</div>
        ${msg.role === 'user' ? '<div class="message-avatar"></div>' : ''}
      </div>
    `;
  }

  // 渲染訊息：驅動虛擬滾動模組
  // 契約不變——外部改完 store 後呼叫此函數即可
  function renderMessages() {
    if (!vlist) {
      // 首次建立：模組建構時會做一次渲染，再強制貼底顯示最新訊息
      vlist = createVirtualMessageList({
        scrollEl: messagesList.parentElement,
        listEl: messagesList,
        getItems: () => store.getAll(),
        keyOf: (m) => m.id,
        renderItem: renderMessageItemHTML,
      });
      vlist.scrollToBottom();
    } else {
      // 資料變動 → 重新評估可視區並渲染（若使用者在底部會自動貼底）
      vlist.sync();
    }
  }

  // 業務模組實例化與接線
  const poller = createAiResponsePoller({
    api, token, store,
    onRender: renderMessages,
    onInputLock: setInputLock,
    getCharacterName,
  });

  const sender = createMessageSender({
    api, token, store,
    onRender: renderMessages,
    onInputLock: setInputLock,
    getCharacterName,
    getConversationId,
    startPolling: poller.pollForAIResponse,
  });

  const manager = createConversationManager({
    api, token, store,
    onRender: renderMessages,
    showInitializing,
    hideInitializing,
    setCharacterName: (name) => { characterNameEl.textContent = name; },
    setCharacterStatus: (status) => { characterStatusEl.textContent = status; },
    setConversationId,
    getConversationId,
  });

  // 顯示初始化狀態
  showInitializing();

  // 初始化聊天室：載入角色信息 + 對話內容（懸浮層由 manager 內部控制）
  if (characterId) {
    await manager.initializeChat(characterId);
  } else {
    console.warn('⚠️ [chat.js] 缺少 characterId 參數');
    showInitializing('缺少角色參數，無法開啟聊天室');
  }

  // 三點按鈕事件（委派到列表上，重新渲染也不會失效）
  messagesList.addEventListener('click', (e) => {
    const btn = e.target.closest('.message-menu-btn');
    if (btn) {
      e.stopPropagation();
      showMessageMenu(btn, btn.dataset.messageId, { onDelete: manager.deleteMessage });
    }
  });

  // 發送訊息（讀取輸入框內容、清空、交給 sender 處理）
  function handleSend() {
    const text = messageInput.value.trim();
    if (!text) return;
    messageInput.value = '';
    sender.sendMessage(text);
  }

  // 事件綁定
  sendBtn.addEventListener('click', handleSend);

  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  // 重啟聊天室：只有成功時才清空輸入框（失敗時 manager 內部已顯示 toast 並收掉懸浮層）
  restartBtn.addEventListener('click', async () => {
    if (!confirm('確定要重啟聊天室嗎？這將刪除所有現有聊天記錄（包含主人公人設）。')) {
      return;
    }
    const result = await manager.restartConversation(characterId);
    if (result) {
      messageInput.value = '';
    }
  });

  // 主人公人設彈窗（開關/載入/儲存/焦點管理皆由 protagonistModal.js 負責）
  initProtagonistModal({ getConversationId, getToken: () => token });

  // 刷新聊天頁面：重載聊天室 iframe（重新初始化、拉回最新訊息），lobby 側邊欄不受影響
  refreshBtn.addEventListener('click', () => {
    window.location.reload();
  });

  // 初始化渲染
  renderMessages();
  messageInput.focus();

  console.log('✅ [chat.js] 聊天室已初始化');
}
