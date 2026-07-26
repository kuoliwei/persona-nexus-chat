# Design — chat-ui-foundation

> 忠實記錄 persona-nexus-chat **當前的設計結構**。行為（做什麼）在 main spec，本文記錄
> **結構與決策（怎麼組成的）**。只描述現況，不寫理由、不做評判。

## 頁面結構

單一 `index.html`，無前端路由。內含聊天頭部（角色資訊 + 3 個功能按鈕）、訊息列表容器、
輸入區、主人公人設彈窗（`#protagonistModal`）、初始化懸浮層（`#initializingOverlay`）。
彈窗與懸浮層皆用 `.hidden` class 搭配 `display: none` 控制顯隱。

## 腳本結構（無框架、無元件化）

- `src/main.js`：入口。解析 URL query string（`characterId`／`token`），驗證後寫入
  `localStorage`，呼叫 `chat.js` 的 `initChat(characterId)`。若參數缺失則導向 `/login/`。
- `src/chat.js`：唯一的行為腳本（886 行），`initChat()` 內部用閉包持有 `messages` 陣列、
  `vlist`（虛擬滾動實例）、`dismissOpenMenu`（目前開啟中選單的關閉函式）等狀態，所有子函式
  （`renderMessages`／`sendMessage`／`deleteMessage`／`pollForConversation`／
  `pollForAIResponse`／主人公人設的開關與存檔／重啟流程）都定義在同一個函式作用域內。
- `src/virtualMessageList.js`：獨立模組，透過 `createVirtualMessageList({ scrollEl, listEl,
  getItems, keyOf, renderItem })` 工廠函式建立實例，回傳 `{ sync, scrollToBottom,
  isNearBottom, destroy }`。不持有訊息資料本身，只讀 `getItems()` 取得。
- `src/menuPosition.js`：獨立模組，`positionMenu(menu, anchor)` 純函式，依視窗尺寸與
  錨點位置計算座標，無副作用之外的內部狀態。
- `src/api.js`：獨立模組，匯出 `getCurrentUserId()`／`decodeToken()`。**沒有任何檔案
  import 此模組**——不在實際資料流內。

## 與後端的整合方式

- `chat.js` 內所有對後端的請求皆直接呼叫原生 `fetch()`，無封裝的 API client 模組
  （對照 `src/api.js` 雖存在但内容與這些請求無關）。
- 每個 `fetch()` 呼叫各自組裝 `headers: { 'Authorization': \`Bearer ${token}\` }`
  （`token` 為 `initChat()` 頂層從 `localStorage.getItem('token')` 讀取的閉包變數）。
- 錯誤處理策略：依端點不同而異——
  - 送出訊息／輪詢 AI 回覆失敗：在畫面上插入一則「失敗氣泡」取代佔位符，訊息陣列的一部分。
  - 刪除訊息／主人公人設操作失敗：呼叫 `showToast()` 顯示 3 秒後自動消失的懸浮通知。
  - 重啟失敗：呼叫瀏覽器原生 `alert()`。
  三種錯誤呈現機制（失敗氣泡／toast／alert）依操作類型各自實作，無統一的錯誤顯示層。

## 訊息渲染與虛擬滾動

`chat.js` 的 `renderMessageItemHTML(msg)` 產生單條訊息的 HTML 字串（模板字面值拼接，
非用 DOM API 逐一建立節點），交給 `virtualMessageList.js` 的 `renderItem` 參數使用。
`virtualMessageList.js` 內部用 `Map` 快取每個訊息 id 對應的實測高度與目前掛載的 DOM
節點，捲動時只增刪離開/進入可視區的節點（複用式協調），並用上下兩個 spacer div 佔位
代表未渲染訊息的捲動高度。

## 輪詢機制（兩處，模式相同但各自獨立實作）

1. `pollForConversation(charId)`：`for` 迴圈 + `await sleep(1000)`，同步阻塞式輪詢
   聊天室建立狀態，最多 120 次。
2. `pollForAIResponse(...)`：`setInterval(..., 1000)` 事件迴圈式輪詢 AI 生成狀態，
   回傳一個「停止輪詢」函式供呼叫端在發送失敗時提前終止。

兩者輪詢上限皆為 120 次、間隔皆為 1 秒，但實作機制（`for`+`sleep` vs `setInterval`）不同，
各自獨立撰寫，無共用的輪詢輔助函式。

## 訊息選單與彈出定位

`showMessageMenu()` 動態建立選單 DOM、呼叫 `menuPosition.js` 的 `positionMenu()` 定位、
用 `setTimeout(..., 0)` 延遲註冊全域 `click` 監聽器（避免觸發選單的同一次點擊立刻把
選單關掉），關閉時同步移除該監聽器與 DOM 節點。同一時間只允許一個選單存在（開新選單前
會先呼叫前一個選單的 `dismissOpenMenu()`）。

## 主人公人設彈窗

無 `role="dialog"`／`aria-modal` 屬性，開啟/關閉純粹是 class 切換（`.hidden`）；
沒有焦點管理（開啟時不把焦點移入彈窗，關閉時不歸還焦點給觸發按鈕），也沒有
Escape 鍵關閉的鍵盤事件綁定，僅支援點擊 ✕ 按鈕或點擊遮罩（`modal-overlay` 本身）關閉。

## 可及性現況

整個專案（`index.html` + `src/`）沒有任何 `aria-live`／`aria-label`／`role` 屬性。
懸浮通知（toast）、初始化懸浮層的文字更新、彈窗，皆無對應的 ARIA 標記。圖示按鈕
（🎭／🔄／♻️／⋮／✕）僅靠 `title` 屬性提供文字說明。

## 現存但與本專案功能無關的檔案

- `src/api.js`：`getCurrentUserId()`／`decodeToken()` 沒有任何呼叫點，不影響現有的
  登入守門機制（見 main spec「登入守門與參數解析」需求，實際邏輯在 `main.js` 內）。

## 其他現況

- 無測試框架、無 lint 設定檔、無 TypeScript。
- `package.json` 的 `devDependencies` 僅含 `vite`；`dependencies` 欄位不存在。
- Vite 設定：`base: '/chat/'`、`server.port: 5176`（`strictPort: true`）、
  `server.host: true`、`server.allowedHosts: true`，均服務於 Caddy 同源反向代理架構。
- **與 auth/character 不同**：本專案一開始就是獨立 git repo（`.git` 存在，遠端為
  `origin/main`），且有既存的 commit 歷史（`d972e27` 為當前 HEAD 之前最後一次 commit）；
  工作目錄另有兩筆尚未 commit 的既存修改（`src/chat.js` 的欄位路徑修正、`vite.config.js`
  的註解新增），與本輪優化無關，本次改動不會觸碰或涵蓋這兩筆既存變更。
