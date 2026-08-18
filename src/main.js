import './style.css';
import { initChat } from './chat.js';
import { getToken } from './session.js';
console.log('📡 [main.js] persona-nexus-chat 初始化開始');

// 同源部署後不需要向 gateway 取設定（API 一律走相對路徑），因此不再載入 config。
// 後端可達性由外層 lobby 啟動時探測；此頁是由 lobby 以 iframe 載入的。
const LOGIN_APP_URL = '/login';

// 讀取 URL 參數
const urlParams = new URLSearchParams(window.location.search);
const characterId = urlParams.get('characterId');

console.log('📍 [main.js] characterId:', characterId, ', 已登入:', !!getToken());

// 認證檢查：token 只問 localStorage（與 lobby/auth 共享），不再解析網址參數
if (!characterId || !getToken()) {
  console.log('❌ [main.js] 缺少必要參數或未登入，導向登入頁');
  window.location.href = `${LOGIN_APP_URL}/`;
} else {
  // 初始化聊天室
  await initChat(characterId);

  console.log('✅ [main.js] 聊天室初始化完成');
}
