/**
 * messageStore.js — 訊息陣列的唯一寫入點
 *
 * 目的：聊天室內任何新增/替換/刪除訊息的邏輯都透過這組方法操作，
 *       不在其他模組內直接對訊息陣列做原地變更（push、索引賦值等）。
 *       每次呼叫 createMessageStore() 都建立全新、互相隔離的狀態容器。
 */

export function createMessageStore(initialMessages = []) {
  let messages = [...initialMessages];

  function getAll() {
    return messages;
  }

  function setAll(newMessages) {
    messages = newMessages || [];
  }

  function push(message) {
    messages.push(message);
  }

  // 用新訊息取代指定 id 的訊息（找不到就 push）
  function replaceOrPush(id, newMessage) {
    const index = messages.findIndex(m => m.id === id);
    if (index !== -1) {
      messages[index] = newMessage;
    } else {
      messages.push(newMessage);
    }
  }

  // 依 id 集合移除訊息（例如後端回傳的 deletedIds）
  function removeByIds(idSet) {
    messages = messages.filter(m => !idSet.has(m.id));
  }

  function findById(id) {
    return messages.find(m => m.id === id);
  }

  function findIndexById(id) {
    return messages.findIndex(m => m.id === id);
  }

  return { getAll, setAll, push, replaceOrPush, removeByIds, findById, findIndexById };
}

// 建構「失敗氣泡」訊息物件，取代原本多處重複的建構邏輯
export function makeFailureMessage(text) {
  return {
    id: `failure_${Date.now()}`,
    role: 'assistant',
    text,
    status: 'failed',
    isPlaceholder: true,
  };
}
