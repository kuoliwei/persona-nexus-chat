import { getConfig } from './config-loader.js';

export async function initChat(characterId) {
  const config = getConfig();
  // 直接硬編碼 gateway URL（像 persona-nexus-character 的做法）
  const GATEWAY_URL = 'http://localhost:8000';

  console.log('📡 [chat.js] 初始化聊天室，characterId:', characterId);

  const messageInput = document.getElementById('messageInput');
  const sendBtn = document.getElementById('sendBtn');
  const messagesList = document.getElementById('messagesList');
  const homeBtn = document.getElementById('homeBtn');
  const characterNameEl = document.getElementById('characterName');
  const characterStatusEl = document.getElementById('characterStatus');

  let messages = [];
  let token = localStorage.getItem('token');

  // 1. 初始化聊天室：載入角色信息 + 對話內容
  if (characterId) {
    await initializeChat(characterId);
  } else {
    console.warn('⚠️ [chat.js] 缺少 characterId 參數');
  }

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
      messages = conversation.messages || [];
      console.log('✅ [chat.js] 對話載入成功，訊息數:', messages.length);

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

    try {
      console.log('📤 [chat.js] 發送訊息...');

      // 1. 發送訊息到後端
      const sendRes = await fetch(
        `${GATEWAY_URL}/conversations/character/${characterId}/messages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ role: 'user', text }),
        }
      );

      if (!sendRes.ok) {
        throw new Error(`Failed to send message: ${sendRes.status}`);
      }

      const newMessage = await sendRes.json();
      messages.push(newMessage);
      messageInput.value = '';
      renderMessages();

      console.log('✅ [chat.js] 訊息已發送');
    } catch (error) {
      console.error('❌ [chat.js] 發送訊息失敗:', error);
    }
  }

  // 事件綁定
  sendBtn.addEventListener('click', sendMessage);

  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
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
