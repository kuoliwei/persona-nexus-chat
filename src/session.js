// 跨頁狀態的單一讀寫入口：只包裝儲存位置與鍵名，不含業務邏輯。

export function getToken() {
  return localStorage.getItem('token');
}

export function setToken(token) {
  localStorage.setItem('token', token);
}

export function getConversationId() {
  return sessionStorage.getItem('conversationId');
}

export function setConversationId(conversationId) {
  sessionStorage.setItem('conversationId', conversationId);
}
