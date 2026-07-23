import { getConfig } from './config-loader.js';
import { createVirtualMessageList } from './virtualMessageList.js';
import { positionMenu } from './menuPosition.js';

export async function initChat(characterId) {
  const config = getConfig();

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

  let messages = [];
  let token = localStorage.getItem('token');
  // 🆕 虛擬滾動實例（首次 renderMessages 時建立）；必須在 initializeChat 之前宣告，避免 TDZ
  let vlist = null;

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
  //    懸浮層由 initializeChat 內部控制：就緒才撤、失敗則維持並顯示錯誤
  if (characterId) {
    await initializeChat(characterId);
  } else {
    console.warn('⚠️ [chat.js] 缺少 characterId 參數');
    showInitializing('缺少角色參數，無法開啟聊天室');
  }

  // 🆕 單條訊息的 HTML 模板（供虛擬滾動模組逐項渲染）
  // 用戶訊息旁加三點選單按鈕（臨時訊息 temp_ 還沒存入 DB，不顯示選單）
  function renderMessageItemHTML(msg) {
    return `
      <div class="message ${msg.role === 'user' ? 'user' : 'bot'}">
        ${msg.role !== 'user' ? '<div class="message-avatar"></div>' : ''}
        ${msg.role === 'user' && !String(msg.id).startsWith('temp_')
          ? `<button class="message-menu-btn" data-message-id="${msg.id}" title="更多選項">⋮</button>`
          : ''}
        <div class="message-content">${formatMessageText(msg.text)}</div>
        ${msg.role === 'user' ? '<div class="message-avatar"></div>' : ''}
      </div>
    `;
  }

  // 渲染訊息：驅動虛擬滾動模組
  // 契約不變——外部改完 messages 陣列後呼叫此函數即可（沿用原本用法，12 處呼叫點無需改動）
  function renderMessages() {
    if (!vlist) {
      // 首次建立：模組建構時會做一次渲染，再強制貼底顯示最新訊息
      vlist = createVirtualMessageList({
        scrollEl: messagesList.parentElement,
        listEl: messagesList,
        getItems: () => messages,
        keyOf: (m) => m.id,
        renderItem: renderMessageItemHTML,
      });
      vlist.scrollToBottom();
    } else {
      // 資料變動 → 重新評估可視區並渲染（若使用者在底部會自動貼底）
      vlist.sync();
    }
  }

  // 🆕 三點按鈕事件（委派到列表上，重新渲染也不會失效）
  messagesList.addEventListener('click', (e) => {
    const btn = e.target.closest('.message-menu-btn');
    if (btn) {
      e.stopPropagation();
      showMessageMenu(e, btn.dataset.messageId, btn);
    }
  });

  // 目前開啟中選單的關閉函式，開新選單前用它把舊的連同監聽器一起收掉
  let dismissOpenMenu = null;

  // 🆕 顯示訊息選單（參考 lobby sidebar 的 conversation-menu 效果）
  function showMessageMenu(event, messageId, anchorBtn) {
    // 先關掉已存在的選單（避免疊加）
    if (dismissOpenMenu) dismissOpenMenu();

    // 建立菜單
    const menu = document.createElement('div');
    menu.className = 'message-menu';

    // 關閉選單：移除節點的同時一定解除監聽器，避免監聽器殘留累積
    function dismissMenu() {
      menu.remove();
      document.removeEventListener('click', closeMenu);
      dismissOpenMenu = null;
    }
    dismissOpenMenu = dismissMenu;

    // 編輯選項（功能未實作，先佔位）
    const editOption = document.createElement('div');
    editOption.className = 'message-menu-item';
    editOption.textContent = '✏️ 編輯';
    editOption.addEventListener('click', () => {
      console.log(`✏️ [chat.js] 編輯訊息（尚未實作）: messageId=${messageId}`);
      dismissMenu();
    });

    // 刪除選項：刪除該訊息及其後所有訊息（回溯式刪除）
    const deleteOption = document.createElement('div');
    deleteOption.className = 'message-menu-item';
    deleteOption.textContent = '🗑️ 刪除';
    deleteOption.addEventListener('click', async () => {
      dismissMenu();
      if (confirm('確定要刪除這條訊息嗎？\n該訊息之後的所有對話（包含 AI 回覆）也會一併刪除。')) {
        await deleteMessage(messageId);
      }
    });

    menu.appendChild(editOption);
    menu.appendChild(deleteOption);

    // 先掛上 DOM 才量得到選單尺寸，再依可用空間定位（避免飛出畫面）
    menu.style.position = 'fixed';
    menu.style.visibility = 'hidden';
    document.body.appendChild(menu);
    positionMenu(menu, anchorBtn);
    menu.style.visibility = '';

    // 點擊外部關閉菜單
    setTimeout(() => {
      document.addEventListener('click', closeMenu);
    }, 0);

    function closeMenu(e) {
      if (!menu.contains(e.target) && e.target !== anchorBtn) {
        dismissMenu();
      }
    }
  }

  // 🆕 懸浮通知（3 秒後自動消失）
  function showToast(message) {
    // 移除既有的 toast（避免疊加）
    const existingToast = document.querySelector('.toast-notification');
    if (existingToast) existingToast.remove();

    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.textContent = message;
    document.body.appendChild(toast);

    // 3 秒後淡出並移除
    setTimeout(() => {
      toast.classList.add('toast-fade-out');
      setTimeout(() => toast.remove(), 300); // 等淡出動畫跑完
    }, 3000);
  }

  // 🆕 刪除訊息（回溯式：該訊息及其後所有訊息一併刪除）
  async function deleteMessage(messageId) {
    try {
      const conversationId = sessionStorage.getItem('conversationId');
      if (!conversationId) {
        showToast('聊天室 ID 不存在，請重新載入頁面');
        return;
      }

      console.log(`🗑️ [chat.js] 刪除訊息: conversationId=${conversationId}, messageId=${messageId}`);

      const res = await fetch(
        `/api/conversations/${conversationId}/messages/${messageId}`,
        {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` },
        }
      );

      if (res.status === 409) {
        // AI 生成中，拒絕刪除 → 懸浮通知
        const data = await res.json();
        console.log(`🚫 [chat.js] 刪除被拒（生成中）: ${data.message}`);
        showToast(data.message || 'AI 正在回覆中，請稍後再試');
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error(`❌ [chat.js] 刪除失敗: ${res.status}`);
        showToast(data.message || `刪除失敗（${res.status}）`);
        return;
      }

      const result = await res.json();
      console.log(`✅ [chat.js] 刪除成功: 共 ${result.deletedCount} 條`, result.deletedIds);

      // 用後端回傳的 deletedIds 從本地陣列移除對應訊息
      const deletedIdSet = new Set(result.deletedIds);
      messages = messages.filter(m => !deletedIdSet.has(m.id));
      renderMessages();
    } catch (error) {
      console.error('❌ [chat.js] 刪除訊息異常:', error);
      showToast(`刪除失敗: ${error.message}`);
    }
  }

  // HTML 逃逸（防止 XSS）
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // 🆕 訊息文本格式化：括弧內的敘事描寫 → 斜體淡色（並移除括弧本身）
  // 先逃逸再轉換，支援全形（）與半形 ( ) 括弧
  function formatMessageText(text) {
    const escaped = escapeHtml(text);
    return escaped
      .replace(/（([^（）]*)）/g, '<span class="narrative">$1</span>')
      .replace(/\(([^()]*)\)/g, '<span class="narrative">$1</span>');
  }

  // 初始化聊天室
  async function initializeChat(charId) {
    try {
      console.log('📡 [chat.js] 初始化：獲取角色信息...');

      // 1. 獲取角色名稱
      const characterRes = await fetch(`/api/characters/${charId}`, {
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

      // 角色名稱先更新（輪詢期間就能看到角色名）
      characterNameEl.textContent = characterName;

      // 2. 載入或建立對話（輪詢直到就緒 / 失敗）
      console.log('📡 [chat.js] 載入或建立對話（輪詢）...');
      const conversation = await pollForConversation(charId);

      if (!conversation) {
        // 建立失敗或超時：維持懸浮層並顯示錯誤
        characterStatusEl.textContent = '離線';
        showInitializing('聊天室建立失敗，請重新整理頁面再試');
        return;
      }

      // 3. 就緒：保存 ID、載入訊息、更新 UI、撤掉懸浮層
      sessionStorage.setItem('conversationId', conversation.conversationId);
      messages = conversation.messages || [];
      console.log('✅ [chat.js] 對話載入成功，聊天室 ID:', conversation.conversationId, '訊息數:', messages.length);

      characterStatusEl.textContent = '線上';
      renderMessages();
      hideInitializing();

    } catch (error) {
      console.error('❌ [chat.js] 初始化失敗:', error);
      characterNameEl.textContent = '載入失敗';
      characterStatusEl.textContent = '離線';
      showInitializing('聊天室載入失敗，請重新整理頁面再試');
    }
  }

  // 🆕 輪詢聊天室建立狀態，直到就緒（200）或失敗（503 / 超時）
  async function pollForConversation(charId) {
    const maxAttempts = 120;   // 最多輪詢 120 次
    const intervalMs = 1000;   // 每次間隔 1 秒（最多等 120 秒）

    console.log(`\n🔄 [chat.js] 開始輪詢聊天室狀態: charId=${charId}, 最多${maxAttempts}次`);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(`  ┌─ 【輪詢 ${attempt}/${maxAttempts}】 GET /conversations/character/${charId}`);

      try {
        const res = await fetch(`/api/conversations/character/${charId}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });

        console.log(`  ├─ HTTP ${res.status}`);

        // 200：聊天室已就緒
        if (res.status === 200) {
          const data = await res.json();
          console.log(`  ✅ 聊天室就緒（輪詢 ${attempt} 次）`);
          console.log(`  └─ conversationId: ${data.conversationId}, 訊息數: ${data.messages?.length || 0}\n`);
          return data;
        }

        // 202：建立中，繼續輪詢
        if (res.status === 202) {
          console.log(`  ├─ 狀態: preparing（聊天室準備中）`);
          console.log(`  └─ 等待 ${intervalMs}ms 後重試...\n`);
          showInitializing('聊天室準備中...');
          await sleep(intervalMs);
          continue;
        }

        // 503：建立失敗
        if (res.status === 503) {
          const data = await res.json();
          console.error(`  ❌ 聊天室建立失敗`);
          console.error(`  └─ message: ${data.message}\n`);
          return null;
        }

        // 其他狀態碼
        console.error(`  ❌ 未預期的 HTTP 狀態: ${res.status}\n`);
        return null;

      } catch (error) {
        console.error(`  ❌ 輪詢請求失敗: ${error.message}\n`);
        return null;
      }
    }

    console.warn(`\n⏱️  [chat.js] 聊天室準備超時（超過 ${maxAttempts} 次輪詢）\n`);
    return null;
  }

  // 🆕 sleep 工具
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
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

      messageInput.value = '';

      // 🆕 【乐观更新】立即创建用户消息（使用临时 ID）
      const tempUserId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const tempUserMessage = {
        id: tempUserId,
        role: 'user',
        text: text,
        createdAt: new Date().toISOString(),
        isTemporary: true, // 标记为临时消息
      };

      messages.push(tempUserMessage);
      console.log(`📝 [chat.js] 用戶訊息已立即顯示（臨時ID: ${tempUserId}）`);
      renderMessages();

      // 【现在创建占位符氣泡】
      const placeholderId = `placeholder_${Date.now()}`;
      const placeholderMessage = {
        id: placeholderId,
        role: 'assistant',
        text: `（${document.getElementById('characterName').textContent} 正在思考中...）`,
        status: 'pending',
        isPlaceholder: true,
      };

      messages.push(placeholderMessage);
      console.log('💬 [chat.js] 占位符已顯示');
      renderMessages();

      console.log('✅ [chat.js] 訊息已顯示，開始輪詢...');

      // 开始轮询 AI 回复，获得停止函数
      const userMessageCreatedAt = tempUserMessage.createdAt;
      console.log(`⏰ [chat.js] 用戶訊息時間: ${userMessageCreatedAt}`);

      const stopPoll = pollForAIResponse(conversationId, placeholderId, userMessageCreatedAt, tempUserId);

      // 🆕 【非同步發送】不 await，但傳遞 placeholderId 和 stopPoll
      // 後端失敗時會停止輪詢並顯示錯誤消息
      sendMessageToBackend(conversationId, tempUserId, text, placeholderId, stopPoll);
    } catch (error) {
      console.error('❌ [chat.js] 發送訊息失敗:', error);
      messageInput.disabled = false;
      sendBtn.disabled = false;
    }
  }

  // 🆕 異步發送消息到後端（非同步，失敗時停止輪詢並顯示錯誤消息）
  async function sendMessageToBackend(conversationId, tempUserId, text, placeholderId, stopPoll) {
    try {
      console.log(`🐛 [DEBUG] POST body 送出: { text: "${text.substring(0, 30)}...", tempUserId: "${tempUserId}" }`);
      const sendRes = await fetch(
        `/api/conversations/${conversationId}/messages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          // 🆕 一併送出臨時 ID，後端生成成功後會在狀態中回傳「臨時 ID ↔ 真實 ID」配對
          body: JSON.stringify({ text, tempUserId }),
        }
      );

      if (!sendRes.ok) {
        // 🆕 【參考 pollForAIResponse 的失敗處理】後端拒絕，直接在前端顯示失敗消息
        console.error(`❌ [chat.js] 發送到後端失敗: ${sendRes.status}`);

        const errorText = await sendRes.text();
        let errorMessage = `HTTP ${sendRes.status}`;
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.message || errorMessage;
        } catch (e) {
          // 無法解析 JSON，使用預設錯誤信息
        }

        // 🆕 【停止輪詢】不再繼續輪詢（發送已失敗）
        if (stopPoll) {
          console.log('⏹️  [chat.js] 停止輪詢，後端已拒絕');
          stopPoll();
        }

        // 刪除占位符，顯示失敗消息（同 pollForAIResponse 的邏輯）
        // 409 也走此通用路徑：保留用戶訊息、佔位符換成失敗氣泡（含後端回傳的具體訊息）
        const placeholderIndex = messages.findIndex(m => m.id === placeholderId);
        const failureMessage = {
          id: `failure_${Date.now()}`,
          role: 'assistant',
          text: `（${document.getElementById('characterName').textContent} 回應失敗: ${errorMessage}，請重試）`,
          status: 'failed',
          isPlaceholder: true,
        };

        if (placeholderIndex !== -1) {
          messages[placeholderIndex] = failureMessage;
        } else {
          messages.push(failureMessage);
        }

        console.log('❌ [chat.js] 已在本地創建失敗消息');
        renderMessages();
        return;
      }

      const response = await sendRes.json();

      // ✅ 後端已接收請求，前端的臨時消息已經顯示
      // 不需要替換，直接保留原始的 tempUserId
      // 成功時會從 /messages 獲取真實數據，失敗時會刪除這個臨時消息
      console.log(`✅ [chat.js] 後端已接收請求，臨時訊息保留為: ${tempUserId}`);
    } catch (error) {
      console.error('❌ [chat.js] 發送到後端異常:', error);

      // 🆕 【停止輪詢】異常時也停止輪詢
      if (stopPoll) {
        console.log('⏹️  [chat.js] 停止輪詢，發送異常');
        stopPoll();
      }

      // 異常時也顯示失敗消息
      const placeholderIndex = messages.findIndex(m => m.id === placeholderId);
      const failureMessage = {
        id: `failure_${Date.now()}`,
        role: 'assistant',
        text: `（${document.getElementById('characterName').textContent} 回應失敗: ${error.message || '未知錯誤'}，請重試）`,
        status: 'failed',
        isPlaceholder: true,
      };

      if (placeholderIndex !== -1) {
        messages[placeholderIndex] = failureMessage;
      } else {
        messages.push(failureMessage);
      }

      renderMessages();
    }
  }

  // 輪詢 AI 回覆（輪詢所有訊息以查找新的 AI 回應）
  // 🆕 注意：不能是 async，否則回傳的是 Promise 而不是停止函數
  function pollForAIResponse(conversationId, placeholderId, userMessageCreatedAt, tempUserId) {
    const maxAttempts = 120; // 最多輪詢 120 次 × 1 秒 = 120 秒，對齊後端 generateResponse timeout
    let attempts = 0;

    const pollInterval = setInterval(async () => {
      attempts++;

      try {
        // 🔑 只輪詢 AI 生成狀態
        const statusRes = await fetch(
          `/api/conversations/${conversationId}/ai-generation-status`,
          {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          }
        );

        if (!statusRes.ok) {
          throw new Error(`Failed to fetch generation status: ${statusRes.status}`);
        }

        const generationStatus = await statusRes.json();
        console.log(`⏳ [chat.js] 查詢 AI 狀態 (${attempts}): ${JSON.stringify(generationStatus)}`);

        // ❌ 如果生成失敗
        if (generationStatus && generationStatus.status === 'failed') {
          console.error(`❌ [chat.js] AI 生成失敗: ${generationStatus.error}`);

          // ✅ 保留用户消息，即使 AI 失败
          // 用户已经看到自己的消息，删除它会造成困惑
          console.log(`📝 [chat.js] 用戶訊息保留，ID: ${tempUserId}`);

          const placeholderIndex = messages.findIndex(m => m.id === placeholderId);

          // 用失敗消息替換占位符
          const failureMessage = {
            id: `failure_${Date.now()}`,
            role: 'assistant',
            text: `（${document.getElementById('characterName').textContent} 回應失敗: ${generationStatus.error || '未知錯誤'}，請重試）`,
            status: 'failed',
            isPlaceholder: true, // 標記為前端臨時消息，不會被保存
          };

          if (placeholderIndex !== -1) {
            messages[placeholderIndex] = failureMessage;
          } else {
            messages.push(failureMessage);
          }

          console.log('❌ [chat.js] 已在本地創建失敗消息');
          renderMessages();
          clearInterval(pollInterval);
          messageInput.disabled = false;
          sendBtn.disabled = false;
          return; // 停止輪詢
        }

        // ✅ 如果生成完成，才調用消息 API
        if (generationStatus && generationStatus.status === 'completed') {
          console.log(`✅ [chat.js] AI 生成完成，開始取得消息...`);

          const messagesRes = await fetch(
            `/api/conversations/${conversationId}/messages`,
            {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${token}`,
              },
            }
          );

          if (!messagesRes.ok) {
            throw new Error(`Failed to fetch messages: ${messagesRes.status}`);
          }

          const latestMessages = await messagesRes.json();
          console.log(`📋 [chat.js] 取得訊息數=${latestMessages.length}`);

          // 🆕 【ID 精準配對】優先用後端回傳的「臨時 ID ↔ 真實 ID」配對資訊替換
          // generationStatus: { userMessageId, assistantMessageId, tempUserId }
          let latestAIMessage = null;
          if (generationStatus.assistantMessageId) {
            latestAIMessage = latestMessages.find(m => m.id === generationStatus.assistantMessageId);
            console.log(`🔗 [chat.js] 使用配對資訊: AI 訊息 ID=${generationStatus.assistantMessageId}`);
            console.log(`🐛 [DEBUG] 走【ID 配對】路徑, 配對資訊: tempUserId=${generationStatus.tempUserId}, userMessageId=${generationStatus.userMessageId}, assistantMessageId=${generationStatus.assistantMessageId}`);
          }

          // 後備：配對資訊缺失時，退回時間篩選（相容舊後端）
          if (!latestAIMessage) {
            console.log(`🐛 [DEBUG] 走【時間篩選】後備路徑（配對資訊缺失或找不到對應訊息）`);
            const newAIMessages = latestMessages
              .filter(m =>
                m.role === 'assistant' &&
                m.status === 'completed' &&
                new Date(m.createdAt) > new Date(userMessageCreatedAt)
              );
            latestAIMessage = newAIMessages.pop(); // 取最新的一個
          }

          if (latestAIMessage) {
            console.log(`✅ [chat.js] 找到 AI 回覆: ${latestAIMessage.id}`);

            // 🆕 【替換臨時用戶訊息】用配對資訊把 temp_xxx 換成 DB 真實記錄
            if (generationStatus.userMessageId) {
              const realUserMessage = latestMessages.find(m => m.id === generationStatus.userMessageId);
              const tempUserIndex = messages.findIndex(m => m.id === tempUserId);
              if (realUserMessage && tempUserIndex !== -1) {
                messages[tempUserIndex] = realUserMessage;
                console.log(`✅ [chat.js] 臨時用戶訊息已替換: ${tempUserId} → ${realUserMessage.id}`);
              }
            }

            // 找到占位符並替換
            const placeholderIndex = messages.findIndex(m => m.id === placeholderId);

            if (placeholderIndex !== -1) {
              messages[placeholderIndex] = latestAIMessage;
              console.log(`✅ [chat.js] 占位符已替換`);
            } else {
              messages.push(latestAIMessage);
              console.log(`⚠️ [chat.js] 占位符已添加`);
            }

            // 🐛 【DEBUG】替換後驗證：陣列中不應再有本輪的臨時 ID
            const remainingTemp = messages.filter(m =>
              String(m.id).startsWith('temp_') || String(m.id).startsWith('placeholder_')
            );
            console.log(`🐛 [DEBUG] ===== 替換後驗證 =====`);
            console.log(`🐛 [DEBUG]   陣列末兩條: [${messages.slice(-2).map(m => `${m.id}(${m.role})`).join(', ')}]`);
            console.log(`🐛 [DEBUG]   殘留臨時訊息: ${remainingTemp.length === 0 ? '無 ✅' : remainingTemp.map(m => m.id).join(', ') + ' ❌'}`);

            renderMessages();
            clearInterval(pollInterval);
            messageInput.disabled = false;
            sendBtn.disabled = false;
            return;
          }
        }

        // 超時
        if (attempts >= maxAttempts) {
          console.warn('⚠️ [chat.js] 輪詢超時');

          // ✅ 保留用户消息，即使超时
          console.log(`📝 [chat.js] 用戶訊息保留，ID: ${tempUserId}`);

          const placeholderIndex = messages.findIndex(m => m.id === placeholderId);

          const failureMessage = {
            id: `failure_${Date.now()}`,
            role: 'assistant',
            text: `（${document.getElementById('characterName').textContent} 回應失敗，請重試）`,
            status: 'failed',
            isPlaceholder: true,
          };

          if (placeholderIndex !== -1) {
            messages[placeholderIndex] = failureMessage;
          } else {
            messages.push(failureMessage);
          }

          renderMessages();
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
    }, 1000); // 每 1 秒查詢一次

    // 🆕 返回停止輪詢的函數
    return () => {
      clearInterval(pollInterval);
      messageInput.disabled = false;
      sendBtn.disabled = false;
    };
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
  // 🆕 【複用既有管線】不再走專用 restart API，改為：
  //    1. 呼叫現有的刪除聊天室流程（先清 RAG、失敗中止、主角人設一併清除）
  //    2. 成功後走現有的建立聊天室流程（最新角色資料 + RAG 完整初始化 + 就緒輪詢）
  restartBtn.addEventListener('click', async () => {
    if (confirm('確定要重啟聊天室嗎？這將刪除所有現有聊天記錄（包含主人公人設）。')) {
      try {
        // 顯示重啟中的懸浮層
        showInitializing('聊天室重啟中...');

        const conversationId = sessionStorage.getItem('conversationId');
        if (!conversationId) {
          throw new Error('聊天室 ID 不存在，請重新載入頁面');
        }

        // === 1. 刪除舊聊天室（現有刪除管線）===
        console.log('🔄 [chat.js] 重啟：刪除舊聊天室，ID:', conversationId);
        const delRes = await fetch(
          `/api/conversations/${conversationId}`,
          {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` },
          }
        );

        if (!delRes.ok) {
          const data = await delRes.json().catch(() => ({}));
          throw new Error(data.message || `刪除失敗: ${delRes.status}`);
        }
        console.log('✅ [chat.js] 舊聊天室已刪除（含 RAG 資料與主人公人設）');

        // === 2. 建立新聊天室（現有建立管線：RAG 初始化 + 輪詢就緒）===
        showInitializing('聊天室準備中...');
        const conversation = await pollForConversation(characterId);

        if (!conversation) {
          // 建立失敗或超時：維持懸浮層並顯示錯誤
          showInitializing('聊天室建立失敗，請重新整理頁面再試');
          return;
        }

        console.log('✅ [chat.js] 新聊天室已就緒，ID:', conversation.conversationId, '訊息數:', conversation.messages?.length || 0);

        // === 3. 更新前端狀態 ===
        sessionStorage.setItem('conversationId', conversation.conversationId);
        messages = conversation.messages || [];
        messageInput.value = '';
        renderMessages();

        console.log('✅ [chat.js] 重啟完成');
        hideInitializing();
      } catch (error) {
        console.error('❌ [chat.js] 重啟失敗:', error);
        alert(`重啟失敗: ${error.message || '請稍後重試'}`);
        hideInitializing();
      }
    }
  });

  // 🆕 主人公人設彈窗
  const protagonistBtn = document.getElementById('protagonistBtn');
  const protagonistModal = document.getElementById('protagonistModal');
  const protagonistCloseBtn = document.getElementById('protagonistCloseBtn');
  const protagonistSaveBtn = document.getElementById('protagonistSaveBtn');
  const protagonistNameInput = document.getElementById('protagonistNameInput');
  const protagonistBackgroundInput = document.getElementById('protagonistBackgroundInput');

  // 開啟彈窗：載入現有的主角人設
  protagonistBtn.addEventListener('click', async () => {
    const conversationId = sessionStorage.getItem('conversationId');
    if (!conversationId) {
      showToast('聊天室尚未就緒');
      return;
    }

    protagonistModal.classList.remove('hidden');

    try {
      console.log(`👤 [chat.js] 載入主人公人設: conversationId=${conversationId}`);
      const res = await fetch(`/api/conversations/${conversationId}/protagonist`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        protagonistNameInput.value = data.protagonistName || '';
        protagonistBackgroundInput.value = data.protagonistBackground || '';
        console.log(`✅ [chat.js] 主人公人設已載入: 名稱=${data.protagonistName || '(空)'}, 背景=${(data.protagonistBackground || '').length} 字`);
      } else {
        console.error(`❌ [chat.js] 載入主人公人設失敗: ${res.status}`);
        showToast('載入主人公人設失敗');
      }
    } catch (error) {
      console.error('❌ [chat.js] 載入主人公人設異常:', error);
      showToast('載入主人公人設失敗');
    }
  });

  // 關閉彈窗（✕ 按鈕或點擊遮罩）
  protagonistCloseBtn.addEventListener('click', () => {
    protagonistModal.classList.add('hidden');
  });
  protagonistModal.addEventListener('click', (e) => {
    if (e.target === protagonistModal) {
      protagonistModal.classList.add('hidden');
    }
  });

  // 儲存：PUT 到後端（後端先更新 RAG 切片，成功才寫 DB）
  protagonistSaveBtn.addEventListener('click', async () => {
    const conversationId = sessionStorage.getItem('conversationId');
    if (!conversationId) {
      showToast('聊天室尚未就緒');
      return;
    }

    const protagonistName = protagonistNameInput.value.trim();
    const protagonistBackground = protagonistBackgroundInput.value.trim();

    protagonistSaveBtn.disabled = true;
    protagonistSaveBtn.textContent = '儲存中...';

    try {
      console.log(`👤 [chat.js] 儲存主人公人設: 名稱=${protagonistName || '(空)'}, 背景=${protagonistBackground.length} 字`);
      const res = await fetch(`/api/conversations/${conversationId}/protagonist`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ protagonistName, protagonistBackground }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error(`❌ [chat.js] 儲存主人公人設失敗: ${res.status}`);
        showToast(data.message || `儲存失敗（${res.status}）`);
        return;
      }

      console.log('✅ [chat.js] 主人公人設已儲存');
      protagonistModal.classList.add('hidden');
      showToast('主人公人設已儲存');
    } catch (error) {
      console.error('❌ [chat.js] 儲存主人公人設異常:', error);
      showToast(`儲存失敗: ${error.message}`);
    } finally {
      protagonistSaveBtn.disabled = false;
      protagonistSaveBtn.textContent = '儲存';
    }
  });

  // 🆕 刷新聊天頁面：重載聊天室 iframe（重新初始化、拉回最新訊息），lobby 側邊欄不受影響
  refreshBtn.addEventListener('click', () => {
    window.location.reload();
  });

  // 初始化渲染
  renderMessages();
  messageInput.focus();

  console.log('✅ [chat.js] 聊天室已初始化');
}
