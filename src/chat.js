import { getConfig } from './config-loader.js';

export async function initChat(characterId) {
  const config = getConfig();
  // 直接硬編碼 gateway URL（像 persona-nexus-character 的做法）
  const GATEWAY_URL = 'http://localhost:8000';

  console.log('📡 [chat.js] 初始化聊天室，characterId:', characterId);

  const messageInput = document.getElementById('messageInput');
  const sendBtn = document.getElementById('sendBtn');
  const messagesList = document.getElementById('messagesList');
  const restartBtn = document.getElementById('restartBtn');
  const homeBtn = document.getElementById('homeBtn');
  const characterNameEl = document.getElementById('characterName');
  const characterStatusEl = document.getElementById('characterStatus');
  const initializingOverlay = document.getElementById('initializingOverlay');
  const initializingMessage = document.getElementById('initializingMessage');

  let messages = [];
  let token = localStorage.getItem('token');

  // 🆕 顯示初始化懸浮層，禁用輸入
  function showInitializing(message = '聊天室準備中...') {
    initializingOverlay.classList.remove('hidden');
    initializingMessage.textContent = message;
    messageInput.disabled = true;
    sendBtn.disabled = true;
  }

  // 🆕 隱藏初始化懸浮層，啟用輸入
  function hideInitializing() {
    initializingOverlay.classList.add('hidden');
    messageInput.disabled = false;
    sendBtn.disabled = false;
  }

  // 顯示初始化狀態
  showInitializing();

  // 1. 初始化聊天室：載入角色信息 + 對話內容
  if (characterId) {
    await initializeChat(characterId);
  } else {
    console.warn('⚠️ [chat.js] 缺少 characterId 參數');
  }

  // 隱藏初始化層
  hideInitializing();

  // 渲染訊息
  function renderMessages() {
    messagesList.innerHTML = messages.map((msg) => `
      <div class="message ${msg.role === 'user' ? 'user' : 'bot'}">
        ${msg.role !== 'user' ? '<div class="message-avatar"></div>' : ''}
        <div class="message-content">${escapeHtml(msg.text)}</div>
        ${msg.role === 'user' ? '<div class="message-avatar"></div>' : ''}
      </div>
    `).join('');

    // 自動滾動到底部
    messagesList.parentElement.scrollTop = messagesList.parentElement.scrollHeight;
  }

  // HTML 逃逸（防止 XSS）
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // 初始化聊天室
  async function initializeChat(charId) {
    try {
      console.log('📡 [chat.js] 初始化：獲取角色信息...');

      // 1. 獲取角色名稱
      const characterRes = await fetch(`${GATEWAY_URL}/characters/${charId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      let characterName = `角色 #${charId.substring(0, 8)}`;
      if (characterRes.ok) {
        const characterData = await characterRes.json();
        characterName = characterData.data?.name || characterName;
        console.log('✅ [chat.js] 角色信息載入成功:', characterName);
      } else {
        console.warn('⚠️ [chat.js] 無法載入角色信息，使用預設名稱');
      }

      // 2. 載入或建立對話
      console.log('📡 [chat.js] 載入或建立對話...');
      const conversationRes = await fetch(`${GATEWAY_URL}/conversations/character/${charId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (!conversationRes.ok) {
        throw new Error(`Failed to fetch conversation: ${conversationRes.status}`);
      }

      const conversation = await conversationRes.json();
      // 🆕 保存聊天室 ID 到 sessionStorage（分頁隔離）
      sessionStorage.setItem('conversationId', conversation.conversationId);
      messages = conversation.messages || [];
      console.log('✅ [chat.js] 對話載入成功，聊天室 ID:', conversation.conversationId, '訊息數:', messages.length);

      // 3. 更新 UI
      characterNameEl.textContent = characterName;
      characterStatusEl.textContent = '線上';
      renderMessages();

    } catch (error) {
      console.error('❌ [chat.js] 初始化失敗:', error);
      characterNameEl.textContent = '載入失敗';
      characterStatusEl.textContent = '離線';
    }
  }

  // 發送訊息
  async function sendMessage() {
    const text = messageInput.value.trim();
    if (!text) return;

    // 禁用輸入區
    messageInput.disabled = true;
    sendBtn.disabled = true;

    try {
      // 從 sessionStorage 讀取聊天室 ID
      const conversationId = sessionStorage.getItem('conversationId');
      if (!conversationId) {
        throw new Error('聊天室 ID 不存在，請重新載入頁面');
      }

      console.log('📤 [chat.js] 發送訊息，聊天室 ID:', conversationId);

      // 發送訊息到後端
      const sendRes = await fetch(
        `${GATEWAY_URL}/conversations/${conversationId}/messages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ text }),
        }
      );

      if (!sendRes.ok) {
        throw new Error(`Failed to send message: ${sendRes.status}`);
      }

      const response = await sendRes.json();

      // 添加用戶訊息
      if (response.userMessage) {
        messages.push(response.userMessage);
      }

      // 添加 AI 佔位訊息（正在思考中...）
      let assistantMessage = null;
      if (response.assistantMessage) {
        assistantMessage = response.assistantMessage;
        messages.push(assistantMessage);
      }

      messageInput.value = '';
      renderMessages();

      console.log('✅ [chat.js] 訊息已發送，開始輪詢 AI 回覆...');

      // 🆕 開始輪詢 AI 回覆（如果是 AI 訊息）
      if (assistantMessage) {
        pollForAIResponse(conversationId, assistantMessage.id);
      }
    } catch (error) {
      console.error('❌ [chat.js] 發送訊息失敗:', error);
      messageInput.disabled = false;
      sendBtn.disabled = false;
    }
  }

  // 🆕 只更新單一訊息的 DOM（不重新渲染整個列表）
  function updateMessageDOM(messageId, newText) {
    const messageElements = document.querySelectorAll('.message');
    for (let el of messageElements) {
      const contentEl = el.querySelector('.message-content');
      // 簡單的方式：檢查該訊息在 messages 陣列中是否存在
      const msgIndex = messages.findIndex(m => m.id === messageId);
      if (msgIndex !== -1 && el === messagesList.children[msgIndex]) {
        contentEl.textContent = newText;
        break;
      }
    }
  }

  // 🆕 輪詢 AI 回覆進度
  async function pollForAIResponse(conversationId, messageId) {
    const maxAttempts = 120; // 最多輪詢 120 次 (60 秒)
    let attempts = 0;

    const pollInterval = setInterval(async () => {
      attempts++;

      try {
        const res = await fetch(
          `${GATEWAY_URL}/conversations/${conversationId}/messages/${messageId}`,
          {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          }
        );

        if (!res.ok) {
          throw new Error(`Failed to fetch message: ${res.status}`);
        }

        const message = await res.json();

        console.log(`⏳ [chat.js] 查詢 AI 回覆狀態 (${attempts}): ${message.status}`);

        // 更新訊息列表中的訊息
        const msgIndex = messages.findIndex(m => m.id === messageId);
        if (msgIndex !== -1) {
          messages[msgIndex] = message;

          // 🆕 只更新這一條訊息的 DOM，不重新渲染整個列表
          updateMessageDOM(messageId, message.text);
        }

        // 如果 AI 完成，停止輪詢
        if (message.status === 'completed') {
          console.log('✅ [chat.js] AI 回覆已完成');
          clearInterval(pollInterval);
          messageInput.disabled = false;
          sendBtn.disabled = false;
        }

        // 超時
        if (attempts >= maxAttempts) {
          console.warn('⚠️ [chat.js] 輪詢超時');
          clearInterval(pollInterval);
          messageInput.disabled = false;
          sendBtn.disabled = false;
        }
      } catch (error) {
        console.error('❌ [chat.js] 輪詢失敗:', error);
        clearInterval(pollInterval);
        messageInput.disabled = false;
        sendBtn.disabled = false;
      }
    }, 500); // 每 500ms 查詢一次
  }

  // 事件綁定
  sendBtn.addEventListener('click', sendMessage);

  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // 重啟聊天室
  restartBtn.addEventListener('click', async () => {
    if (confirm('確定要重啟聊天室嗎？這將刪除所有現有聊天記錄。')) {
      try {
        // 🆕 顯示重啟中的懸浮層
        showInitializing('聊天室重啟中...');

        // 直接用 conversationId 呼叫重啟 API
        const conversationId = sessionStorage.getItem('conversationId');
        if (!conversationId) {
          throw new Error('聊天室 ID 不存在，請重新載入頁面');
        }

        console.log('🔄 [chat.js] 重啟聊天室，ID:', conversationId);

        const restartRes = await fetch(
          `${GATEWAY_URL}/conversations/${conversationId}/restart`,
          {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
          }
        );

        if (!restartRes.ok) {
          throw new Error(`重啟失敗: ${restartRes.status}`);
        }

        const result = await restartRes.json();
        const newConversationId = result.data.conversationId;

        console.log('✅ [chat.js] 聊天室已重啟，新對話 ID:', newConversationId);

        // 1. 更新 sessionStorage 中的 conversationId
        sessionStorage.setItem('conversationId', newConversationId);

        // 2. 重新載入新對話的信息（包括開場白）
        const newConversationRes = await fetch(
          `${GATEWAY_URL}/conversations/${newConversationId}`,
          {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` },
          }
        );

        if (newConversationRes.ok) {
          const newConversation = await newConversationRes.json();
          messages = newConversation.messages || [];
          console.log('✅ [chat.js] 新對話訊息已載入');
        }

        messageInput.value = '';
        renderMessages();

        console.log('✅ [chat.js] 重啟完成');

        // 隱藏懸浮層
        hideInitializing();
      } catch (error) {
        console.error('❌ [chat.js] 重啟失敗:', error);
        alert(`重啟失敗: ${error.message}`);
        hideInitializing();
      }
    }
  });

  homeBtn.addEventListener('click', () => {
    // 在 iframe 中使用 window.parent 改變主頁位置
    window.parent.location.href = '/';
  });

  // 初始化渲染
  renderMessages();
  messageInput.focus();

  console.log('✅ [chat.js] 聊天室已初始化');
}
