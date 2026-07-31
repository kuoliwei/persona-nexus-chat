import { makeFailureMessage } from './messageStore.js';

/**
 * messageSender.js — 發送訊息、樂觀更新、啟動 AI 回覆輪詢
 *
 * deps:
 *   api               — API 模組
 *   token             — 認證 token
 *   store             — messageStore 實例
 *   onRender          — () => void，觸發畫面重新渲染
 *   onInputLock       — (locked: boolean) => void，禁用/啟用輸入框與送出鈕
 *   getCharacterName  — () => string
 *   getConversationId — () => string | null（依專案慣例注入，見 protagonistModal.js）
 *   startPolling      — (conversationId, placeholderId, userMessageCreatedAt, tempUserId) => stopFn
 *                        綁定到 aiResponsePoller 實例的 pollForAIResponse
 */
export function createMessageSender({ api, token, store, onRender, onInputLock, getCharacterName, getConversationId, startPolling }) {
  // 發送訊息
  async function sendMessage(text) {
    if (!text) return;

    onInputLock(true);

    try {
      const conversationId = getConversationId();
      if (!conversationId) {
        throw new Error('聊天室 ID 不存在，請重新載入頁面');
      }

      console.log('📤 [messageSender.js] 發送訊息，聊天室 ID:', conversationId);

      // 【樂觀更新】立即創建用戶消息（使用臨時 ID）
      const tempUserId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const tempUserMessage = {
        id: tempUserId,
        role: 'user',
        text: text,
        createdAt: new Date().toISOString(),
        isTemporary: true, // 標記為臨時消息
      };

      store.push(tempUserMessage);
      console.log(`📝 [messageSender.js] 用戶訊息已立即顯示（臨時ID: ${tempUserId}）`);
      onRender();

      // 【現在建立佔位符氣泡】
      const placeholderId = `placeholder_${Date.now()}`;
      const placeholderMessage = {
        id: placeholderId,
        role: 'assistant',
        text: `（${getCharacterName()} 正在思考中...）`,
        status: 'pending',
        isPlaceholder: true,
      };

      store.push(placeholderMessage);
      console.log('💬 [messageSender.js] 占位符已顯示');
      onRender();

      console.log('✅ [messageSender.js] 訊息已顯示，開始輪詢...');

      // 開始輪詢 AI 回覆，取得停止函數
      const userMessageCreatedAt = tempUserMessage.createdAt;
      console.log(`⏰ [messageSender.js] 用戶訊息時間: ${userMessageCreatedAt}`);

      const stopPoll = startPolling(conversationId, placeholderId, userMessageCreatedAt, tempUserId);

      // 【非同步發送】不 await，但傳遞 placeholderId 和 stopPoll
      // 後端失敗時會停止輪詢並顯示錯誤消息
      sendMessageToBackend(conversationId, tempUserId, text, placeholderId, stopPoll);
    } catch (error) {
      console.error('❌ [messageSender.js] 發送訊息失敗:', error);
      onInputLock(false);
    }
  }

  // 異步發送消息到後端（非同步，失敗時停止輪詢並顯示錯誤消息）
  async function sendMessageToBackend(conversationId, tempUserId, text, placeholderId, stopPoll) {
    try {
      console.log(`🐛 [DEBUG] POST body 送出: { text: "${text.substring(0, 30)}...", tempUserId: "${tempUserId}" }`);
      const sendRes = await api.postMessage(conversationId, text, tempUserId, token);

      if (!sendRes.ok) {
        // 【參考 aiResponsePoller.js 的失敗處理】後端拒絕，直接在前端顯示失敗消息
        console.error(`❌ [messageSender.js] 發送到後端失敗: ${sendRes.status}`);

        const errorText = await sendRes.text();
        let errorMessage = `HTTP ${sendRes.status}`;
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.message || errorMessage;
        } catch (e) {
          // 無法解析 JSON，使用預設錯誤信息
        }

        // 【停止輪詢】不再繼續輪詢（發送已失敗）
        if (stopPoll) {
          console.log('⏹️  [messageSender.js] 停止輪詢，後端已拒絕');
          stopPoll();
        }

        // 刪除占位符，顯示失敗消息（同 aiResponsePoller.js 的邏輯）
        // 409 也走此通用路徑：保留用戶訊息、佔位符換成失敗氣泡（含後端回傳的具體訊息）
        store.replaceOrPush(
          placeholderId,
          makeFailureMessage(`（${getCharacterName()} 回應失敗: ${errorMessage}，請重試）`)
        );

        console.log('❌ [messageSender.js] 已在本地創建失敗消息');
        onRender();
        return;
      }

      const response = await sendRes.json();

      // ✅ 後端已接收請求，前端的臨時消息已經顯示
      // 不需要替換，直接保留原始的 tempUserId
      // 成功時會從 /messages 獲取真實數據，失敗時會刪除這個臨時消息
      console.log(`✅ [messageSender.js] 後端已接收請求，臨時訊息保留為: ${tempUserId}`);
    } catch (error) {
      console.error('❌ [messageSender.js] 發送到後端異常:', error);

      // 【停止輪詢】異常時也停止輪詢
      if (stopPoll) {
        console.log('⏹️  [messageSender.js] 停止輪詢，發送異常');
        stopPoll();
      }

      // 異常時也顯示失敗消息
      store.replaceOrPush(
        placeholderId,
        makeFailureMessage(`（${getCharacterName()} 回應失敗: ${error.message || '未知錯誤'}，請重試）`)
      );

      onRender();
    }
  }

  return { sendMessage };
}
