// API 層：集中所有對後端（api-gateway）的 fetch() 呼叫與 Authorization header 組裝。
// 只封裝「單次請求」；輪詢迴圈、計時器、UI 狀態轉換等協調邏輯留在呼叫端（chat.js）。

function authHeaders(token, { json = false } = {}) {
  const headers = { Authorization: `Bearer ${token}` };
  if (json) headers['Content-Type'] = 'application/json';
  return headers;
}

export async function fetchCharacter(characterId, token) {
  return fetch(`/api/characters/${characterId}`, {
    headers: authHeaders(token),
  });
}

export async function fetchConversationStatus(characterId, token) {
  return fetch(`/api/conversations/character/${characterId}`, {
    headers: authHeaders(token),
  });
}

export async function postMessage(conversationId, text, tempUserId, token) {
  return fetch(`/api/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: authHeaders(token, { json: true }),
    body: JSON.stringify({ text, tempUserId }),
  });
}

export async function fetchMessages(conversationId, token) {
  return fetch(`/api/conversations/${conversationId}/messages`, {
    method: 'GET',
    headers: authHeaders(token),
  });
}

export async function fetchGenerationStatus(conversationId, token) {
  return fetch(`/api/conversations/${conversationId}/ai-generation-status`, {
    method: 'GET',
    headers: authHeaders(token),
  });
}

export async function deleteMessage(conversationId, messageId, token) {
  return fetch(`/api/conversations/${conversationId}/messages/${messageId}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });
}

export async function fetchProtagonist(conversationId, token) {
  return fetch(`/api/conversations/${conversationId}/protagonist`, {
    headers: authHeaders(token),
  });
}

export async function saveProtagonist(conversationId, protagonistName, protagonistBackground, token) {
  return fetch(`/api/conversations/${conversationId}/protagonist`, {
    method: 'PUT',
    headers: authHeaders(token, { json: true }),
    body: JSON.stringify({ protagonistName, protagonistBackground }),
  });
}

export async function deleteConversation(conversationId, token) {
  return fetch(`/api/conversations/${conversationId}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });
}
