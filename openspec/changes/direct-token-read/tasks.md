## 1. 修改 main.js

- [x] 1.1 將 import 從 `setToken` 改為 `getToken`：

  修改前（`src/main.js:3`）：
  ```js
  import { setToken } from './session.js';
  ```

  修改後：
  ```js
  import { getToken } from './session.js';
  ```

- [x] 1.2 移除網址 `token` 參數解析、改用 `getToken()` 判斷登入狀態、移除 `setToken(token)` 呼叫：

  修改前（`src/main.js:10-29`）：
  ```js
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
  ```

  修改後：
  ```js
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
  ```

- [x] 1.3 用 `npm run build` 確認無編譯錯誤（無 import 殘留、無語法錯誤）

## 2. 移除 session.js 的零呼叫點 setToken

- [x] 2.1 先用 grep 確認 `setToken` 在完成任務 1 後於全 repo 零呼叫點：
  ```
  grep -rn "setToken" src/
  ```
  預期結果：只剩 `session.js` 內的定義本身，`main.js` 已無呼叫

- [x] 2.2 從 `session.js` 移除 `setToken` 函式：

  修改前（`src/session.js`）：
  ```js
  export function getToken() {
    return localStorage.getItem('token');
  }

  export function setToken(token) {
    localStorage.setItem('token', token);
  }

  export function getConversationId() {
    return sessionStorage.getItem('conversationId');
  }
  ```

  修改後：
  ```js
  export function getToken() {
    return localStorage.getItem('token');
  }

  export function getConversationId() {
    return sessionStorage.getItem('conversationId');
  }
  ```

- [x] 2.3 `npm run build` 再次確認無編譯錯誤

## 3. 手動瀏覽器驗證（本專案無單元測試框架，Playwright 為輔助工具非必要）

- [x] 3.1 正常登入流程：從 auth 登入 → lobby → 建立角色 → 點進聊天室，確認聊天室正常初始化（未被導回登入頁）。以 Playwright 對真實後端驗證，`localStorage` token 與登入 API 回傳的 token 逐字元相等（A=B），chat 打 `/api/conversations/character/:id` 時 `Authorization` header 與 `localStorage` 逐字元相等

- [x] 3.2 模擬 lobby 已改為不帶 token 的情境：手動組裝網址 `http://localhost:8080/chat/index.html?characterId=<真實ID>`（不帶 `?token=`）直接開啟，確認：
  - `localStorage.getItem('token')` 已有合法值（承接自先前登入）
  - 聊天室能正常初始化，不會被導向登入頁（實測網址仍停留在 `/chat/index.html?characterId=...`）
  - 網路面板確認 API 請求的 `Authorization` header 帶有正確 token

- [x] 3.3 驗證未登入情境：先執行 `localStorage.removeItem('token')`，重新整理聊天室網址，確認被導向 `/login/`（實測通過）

- [x] 3.4 驗證缺少 characterId 情境：開啟 `http://localhost:8080/chat/index.html`（不帶 `characterId`），確認被導向 `/login/`（即使 localStorage 有合法 token，實測通過）

- [x] 3.5 全程檢查瀏覽器 console 無新增的 error（Playwright 攔截 console error 事件，實測 0 筆）

## 4. 收尾

- [x] 4.1 `openspec validate direct-token-read --strict` 通過（實測通過）
- [x] 4.2 確認 delta spec 內容與實作一致（`main.js` 只查 `characterId` + `getToken()`，不解析網址 `token`，與 delta spec 描述相符）；主規格的正式同步留待 archive 時處理
- [x] 4.3 本 change 已完成並驗證通過，可以開始 `persona-nexus-character` 的對應 change
