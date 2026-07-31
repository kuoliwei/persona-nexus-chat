import { makeFailureMessage } from './messageStore.js';

/**
 * aiResponsePoller.js — 輪詢 AI 回覆狀態，含回合守門與訊息配對替換
 *
 * deps:
 *   api            — API 模組（chat-service 的 api.js）
 *   token          — 認證 token
 *   store          — messageStore 實例（getAll/replaceOrPush/findIndexById 等）
 *   onRender       — () => void，觸發畫面重新渲染
 *   onInputLock    — (locked: boolean) => void，禁用/啟用輸入框與送出鈕
 *   getCharacterName — () => string，讀取目前角色名稱（用於失敗訊息文案）
 */
export function createAiResponsePoller({ api, token, store, onRender, onInputLock, getCharacterName }) {
  // 輪詢 AI 回覆（輪詢所有訊息以查找新的 AI 回應）
  // 注意：不能是 async，否則回傳的是 Promise 而不是停止函數
  //
  // 🔑 【回合守門】後端的生成狀態是持久化在聊天室上的單一組欄位，會跨回合殘留。
  // 本函式在 POST 送出「之前」就開始輪詢（見 messageSender.js 的 sendMessage），因此第一次查詢（t=1000ms）
  // 有機會早於後端上鎖，讀到的會是上一回合的 completed 與上一回合的訊息 ID。
  // 無條件採信的後果：剛送出的使用者訊息被換成上一回合的舊訊息、佔位符被換成上一回合的
  // 舊回覆、輪詢停止——陣列尾端出現重複 id，虛擬滾動以 id 為 key，兩個氣泡直接從畫面消失。
  // 因此每次拿到狀態都先比對 tempUserId，確認屬於本回合才動畫面。
  //
  // 為何不改成「await POST 成功後才開始輪詢」：那也能避開這個視窗（後端是先上鎖才回應），
  // 但正確性就押在後端內部的語句順序上——日後有人把 tryAcquireLock 往後挪，前端會無聲
  // 退回同樣的 bug。守門法對時序完全不敏感，是比較穩的不變式。
  function pollForAIResponse(conversationId, placeholderId, userMessageCreatedAt, tempUserId) {
    const maxAttempts = 120; // 最多輪詢 120 次 × 1 秒 = 120 秒，對齊後端 generateResponse timeout
    let attempts = 0;

    const pollInterval = setInterval(async () => {
      attempts++;

      try {
        // 只輪詢 AI 生成狀態
        const statusRes = await api.fetchGenerationStatus(conversationId, token);

        if (!statusRes.ok) {
          throw new Error(`Failed to fetch generation status: ${statusRes.status}`);
        }

        const generationStatus = await statusRes.json();
        console.log(`⏳ [aiResponsePoller.js] 查詢 AI 狀態 (${attempts}): ${JSON.stringify(generationStatus)}`);

        // 【回合守門】只認 tempUserId 等於本回合的狀態。不相符 = 本回合還沒在後端上鎖，
        // 讀到的是上一回合殘留的結果 → 不動畫面、不停輪詢、不解除輸入禁用，等下一次查詢。
        // attempts 照常累加（在上面），超時保護維持絕對時間上限，不因守門而無限等待。
        const isThisTurn = generationStatus && generationStatus.tempUserId === tempUserId;
        if (generationStatus && !isThisTurn && generationStatus.status !== 'unknown') {
          console.log(`⏭️  [aiResponsePoller.js] 狀態不屬於本回合（期望 tempUserId=${tempUserId}，實際=${generationStatus.tempUserId}，status=${generationStatus.status}），繼續輪詢`);
        }

        // ❌ 如果生成失敗
        if (isThisTurn && generationStatus.status === 'failed') {
          console.error(`❌ [aiResponsePoller.js] AI 生成失敗: ${generationStatus.error}`);

          // ✅ 保留用戶消息，即使 AI 失敗
          console.log(`📝 [aiResponsePoller.js] 用戶訊息保留，ID: ${tempUserId}`);

          store.replaceOrPush(
            placeholderId,
            makeFailureMessage(`（${getCharacterName()} 回應失敗: ${generationStatus.error || '未知錯誤'}，請重試）`)
          );

          console.log('❌ [aiResponsePoller.js] 已在本地創建失敗消息');
          onRender();
          clearInterval(pollInterval);
          onInputLock(false);
          return; // 停止輪詢
        }

        // ✅ 如果生成完成，才調用消息 API
        if (isThisTurn && generationStatus.status === 'completed') {
          console.log(`✅ [aiResponsePoller.js] AI 生成完成，開始取得消息...`);

          const messagesRes = await api.fetchMessages(conversationId, token);

          if (!messagesRes.ok) {
            throw new Error(`Failed to fetch messages: ${messagesRes.status}`);
          }

          const latestMessages = await messagesRes.json();
          console.log(`📋 [aiResponsePoller.js] 取得訊息數=${latestMessages.length}`);

          // 【ID 精準配對】優先用後端回傳的「臨時 ID ↔ 真實 ID」配對資訊替換
          let latestAIMessage = null;
          if (generationStatus.assistantMessageId) {
            latestAIMessage = latestMessages.find(m => m.id === generationStatus.assistantMessageId);
            console.log(`🔗 [aiResponsePoller.js] 使用配對資訊: AI 訊息 ID=${generationStatus.assistantMessageId}`);
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
            console.log(`✅ [aiResponsePoller.js] 找到 AI 回覆: ${latestAIMessage.id}`);

            // 【替換臨時用戶訊息】用配對資訊把 temp_xxx 換成 DB 真實記錄
            if (generationStatus.userMessageId) {
              const realUserMessage = latestMessages.find(m => m.id === generationStatus.userMessageId);
              const tempUserIndex = store.findIndexById(tempUserId);
              if (realUserMessage && tempUserIndex !== -1) {
                store.getAll()[tempUserIndex] = realUserMessage;
                console.log(`✅ [aiResponsePoller.js] 臨時用戶訊息已替換: ${tempUserId} → ${realUserMessage.id}`);
              }
            }

            // 找到佔位符並替換
            store.replaceOrPush(placeholderId, latestAIMessage);
            console.log(`✅ [aiResponsePoller.js] 占位符已替換`);

            // 【DEBUG】替換後驗證：陣列中不應再有本輪的臨時 ID
            const remainingTemp = store.getAll().filter(m =>
              String(m.id).startsWith('temp_') || String(m.id).startsWith('placeholder_')
            );
            console.log(`🐛 [DEBUG] ===== 替換後驗證 =====`);
            console.log(`🐛 [DEBUG]   陣列末兩條: [${store.getAll().slice(-2).map(m => `${m.id}(${m.role})`).join(', ')}]`);
            console.log(`🐛 [DEBUG]   殘留臨時訊息: ${remainingTemp.length === 0 ? '無 ✅' : remainingTemp.map(m => m.id).join(', ') + ' ❌'}`);

            onRender();
            clearInterval(pollInterval);
            onInputLock(false);
            return;
          }
        }

        // 超時
        if (attempts >= maxAttempts) {
          console.warn('⚠️ [aiResponsePoller.js] 輪詢超時');

          // ✅ 保留用戶消息，即使超時
          console.log(`📝 [aiResponsePoller.js] 用戶訊息保留，ID: ${tempUserId}`);

          store.replaceOrPush(
            placeholderId,
            makeFailureMessage(`（${getCharacterName()} 回應失敗，請重試）`)
          );

          onRender();
          clearInterval(pollInterval);
          onInputLock(false);
        }
      } catch (error) {
        // 輪詢中斷（網路異常，或聊天室在生成期間被刪除而回 404/403）。
        // 這裡必須把佔位符換成失敗訊息——只停掉輪詢的話，「正在思考中…」
        // 會永遠留在畫面上，使用者無從得知已經不會有回覆了。
        console.error('❌ [aiResponsePoller.js] 輪詢失敗:', error);

        store.replaceOrPush(
          placeholderId,
          makeFailureMessage(`（${getCharacterName()} 回應失敗: ${error.message || '連線中斷'}，請重試）`)
        );

        onRender();
        clearInterval(pollInterval);
        onInputLock(false);
      }
    }, 1000); // 每 1 秒查詢一次

    // 返回停止輪詢的函數
    return () => {
      clearInterval(pollInterval);
      onInputLock(false);
    };
  }

  return { pollForAIResponse };
}
