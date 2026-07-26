import './style.css';
import { initChat } from './chat.js';
import { setToken } from './session.js';
console.log('📡 [main.js] persona-nexus-chat 初始化開始');

// 同源部署後不需要向 gateway 取設定（API 一律走相對路徑），因此不再載入 config。
// 後端可達性由外層 lobby 啟動時探測；此頁是由 lobby 以 iframe 載入的。
const LOGIN_APP_URL = '/login';

// 讀取 URL 參數
const urlParams = new URLSearchParams(window.location.search);
const characterId = urlParams.get('characterId');
const token = urlParams.get('token');

console.log('📍 [main.js] characterId:', characterId, ', token:', token ? '存在' : '缺失');

// 認證檢查
if (!characterId || !token) {
  console.log('❌ [main.js] 缺少必要參數，導向登入頁');
  window.location.href = `${LOGIN_APP_URL}/`;
} else {
  // 將 token 存入 localStorage（供 chat.js 使用）
  setToken(token);

  // 初始化聊天室
  await initChat(characterId);

  console.log('✅ [main.js] 聊天室初始化完成');
}
