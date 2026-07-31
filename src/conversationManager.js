import { showToast } from './toast.js';

/**
 * conversationManager.js — 聊天室生命週期：初始化、輪詢建立狀態、重啟、刪除訊息
 *
 * 這四個操作共用同一套「聊天室整體狀態」概念（初始化與重啟都走 pollForConversation；
 * 刪除訊息與重啟都是「conversationId 已知前提下，修改對話內容」的操作），依《程式撰寫
 * 設計原則.md》A1 判斷準則歸在同一檔案：修改其中一個常常需要連帶檢查另一個是否受影響。
 *
 * deps:
 *   api               — API 模組
 *   token             — 認證 token
 *   store             — messageStore 實例
 *   onRender          — () => void
 *   showInitializing  — (message?: string) => void
 *   hideInitializing  — () => void
 *   setCharacterName  — (name: string) => void
 *   setCharacterStatus— (status: string) => void
 *   setConversationId — (id: string) => void（session.js）
 *   getConversationId — () => string | null（session.js）
 */
export function createConversationManager({
  api,
  token,
  store,
  onRender,
  showInitializing,
  hideInitializing,
  setCharacterName,
  setCharacterStatus,
  setConversationId,
  getConversationId,
}) {
  // sleep 工具
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // 輪詢聊天室建立狀態，直到就緒（200）或失敗（503 / 超時）
  async function pollForConversation(charId) {
    const maxAttempts = 120;   // 最多輪詢 120 次
    const intervalMs = 1000;   // 每次間隔 1 秒（最多等 120 秒）

    console.log(`\n🔄 [conversationManager.js] 開始輪詢聊天室狀態: charId=${charId}, 最多${maxAttempts}次`);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(`  ┌─ 【輪詢 ${attempt}/${maxAttempts}】 GET /conversations/character/${charId}`);

      try {
        const res = await api.fetchConversationStatus(charId, token);

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

    console.warn(`\n⏱️  [conversationManager.js] 聊天室準備超時（超過 ${maxAttempts} 次輪詢）\n`);
    return null;
  }

  // 初始化聊天室
  async function initializeChat(charId) {
    try {
      console.log('📡 [conversationManager.js] 初始化：獲取角色信息...');

      // 1. 獲取角色名稱
      const characterRes = await api.fetchCharacter(charId, token);

      let characterName = `角色 #${charId.substring(0, 8)}`;
      if (characterRes.ok) {
        const characterData = await characterRes.json();
        characterName = characterData.name || characterName;
        console.log('✅ [conversationManager.js] 角色信息載入成功:', characterName);
      } else {
        console.warn('⚠️ [conversationManager.js] 無法載入角色信息，使用預設名稱');
      }

      // 角色名稱先更新（輪詢期間就能看到角色名）
      setCharacterName(characterName);

      // 2. 載入或建立對話（輪詢直到就緒 / 失敗）
      console.log('📡 [conversationManager.js] 載入或建立對話（輪詢）...');
      const conversation = await pollForConversation(charId);

      if (!conversation) {
        // 建立失敗或超時：維持懸浮層並顯示錯誤
        setCharacterStatus('離線');
        showInitializing('聊天室建立失敗，請重新整理頁面再試');
        return;
      }

      // 3. 就緒：保存 ID、載入訊息、更新 UI、撤掉懸浮層
      setConversationId(conversation.conversationId);
      store.setAll(conversation.messages || []);
      console.log('✅ [conversationManager.js] 對話載入成功，聊天室 ID:', conversation.conversationId, '訊息數:', store.getAll().length);

      setCharacterStatus('線上');
      onRender();
      hideInitializing();

    } catch (error) {
      console.error('❌ [conversationManager.js] 初始化失敗:', error);
      setCharacterName('載入失敗');
      setCharacterStatus('離線');
      showInitializing('聊天室載入失敗，請重新整理頁面再試');
    }
  }

  // 重啟聊天室
  // 【複用既有管線】不再走專用 restart API，改為：
  //    1. 呼叫現有的刪除聊天室流程（先清 RAG、失敗中止、主角人設一併清除）
  //    2. 成功後走現有的建立聊天室流程（最新角色資料 + RAG 完整初始化 + 就緒輪詢）
  async function restartConversation(characterId) {
    try {
      // 顯示重啟中的懸浮層
      showInitializing('聊天室重啟中...');

      const conversationId = getConversationId();
      if (!conversationId) {
        throw new Error('聊天室 ID 不存在，請重新載入頁面');
      }

      // === 1. 刪除舊聊天室（現有刪除管線）===
      console.log('🔄 [conversationManager.js] 重啟：刪除舊聊天室，ID:', conversationId);
      const delRes = await api.deleteConversation(conversationId, token);

      if (!delRes.ok) {
        const data = await delRes.json().catch(() => ({}));
        throw new Error(data.message || `刪除失敗: ${delRes.status}`);
      }
      console.log('✅ [conversationManager.js] 舊聊天室已刪除（含 RAG 資料與主人公人設）');

      // === 2. 建立新聊天室（現有建立管線：RAG 初始化 + 輪詢就緒）===
      showInitializing('聊天室準備中...');
      const conversation = await pollForConversation(characterId);

      if (!conversation) {
        // 建立失敗或超時：丟給外層 catch 統一處理（toast + 解除懸浮層），
        // 不要在這裡 return——否則永遠走不到 catch，toast 架構上不可能顯示。
        throw new Error('聊天室建立失敗，請重新整理頁面再試');
      }

      console.log('✅ [conversationManager.js] 新聊天室已就緒，ID:', conversation.conversationId, '訊息數:', conversation.messages?.length || 0);

      // === 3. 更新前端狀態 ===
      setConversationId(conversation.conversationId);
      store.setAll(conversation.messages || []);
      onRender();

      console.log('✅ [conversationManager.js] 重啟完成');
      hideInitializing();
      return conversation;
    } catch (error) {
      console.error('❌ [conversationManager.js] 重啟失敗:', error);
      showToast(`重啟失敗: ${error.message || '請稍後重試'}`);
      hideInitializing();
      return null;
    }
  }

  // 刪除訊息（回溯式：該訊息及其後所有訊息一併刪除）
  async function deleteMessage(messageId) {
    try {
      const conversationId = getConversationId();
      if (!conversationId) {
        showToast('聊天室 ID 不存在，請重新載入頁面');
        return;
      }

      console.log(`🗑️ [conversationManager.js] 刪除訊息: conversationId=${conversationId}, messageId=${messageId}`);

      const res = await api.deleteMessage(conversationId, messageId, token);

      if (res.status === 409) {
        // AI 生成中，拒絕刪除 → 懸浮通知
        const data = await res.json();
        console.log(`🚫 [conversationManager.js] 刪除被拒（生成中）: ${data.message}`);
        showToast(data.message || 'AI 正在回覆中，請稍後再試');
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error(`❌ [conversationManager.js] 刪除失敗: ${res.status}`);
        showToast(data.message || `刪除失敗（${res.status}）`);
        return;
      }

      const result = await res.json();
      console.log(`✅ [conversationManager.js] 刪除成功: 共 ${result.deletedCount} 條`, result.deletedIds);

      // 用後端回傳的 deletedIds 從本地陣列移除對應訊息
      const deletedIdSet = new Set(result.deletedIds);
      store.removeByIds(deletedIdSet);
      onRender();
    } catch (error) {
      console.error('❌ [conversationManager.js] 刪除訊息異常:', error);
      showToast(`刪除失敗: ${error.message}`);
    }
  }

  return { initializeChat, pollForConversation, restartConversation, deleteMessage };
}
