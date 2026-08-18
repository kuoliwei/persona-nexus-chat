# persona-nexus-chat

聊天室前端，使用者在此與 AI 角色進行對話。Vite + Vanilla JS，無框架。Port 5176（已用 `vite.config.js` 固定 + `strictPort: true`）。由 `persona-nexus-lobby` 以 iframe 載入，`characterId` 透過 URL query string 傳入；token 直接讀共享 localStorage（`direct-token-read` change，2026-08，同源部署下與 lobby/auth 共享同一個 origin）。

## 平台架構總覽

| 專案 | 角色 | Port |
|------|------|------|
| auth-service | Auth 後端，註冊/登入，發 JWT | 3000 |
| persona-nexus-auth | 登入/註冊前端 | 5173 |
| character-service | 角色 CRUD 後端 | 5000 |
| api-gateway | 統一 API 入口，驗證 JWT | 8000 |
| persona-nexus-character | 角色創建/編輯前端 | 5174 |
| persona-nexus-lobby | 角色大廳、首頁 | 5175 |
| **persona-nexus-chat**（本專案） | 聊天室前端 | 5176 |

## 檔案結構

```
index.html              聊天室主頁面（含主人公人設彈窗、初始化懸浮層）
vite.config.js          Vite 配置：base '/chat/'、固定 port 5176、host: true、allowedHosts: true（同源部署經 Caddy 轉發）
package.json            依賴管理（devDependency: vite；playwright 為瀏覽器自動化回歸驗證用，見 chat-frontend-code-quality change）
src/
  main.js               入口：解析 URL 參數（characterId）、經 session.js 的 getToken() 檢查登入狀態、呼叫 initChat()
  session.js            跨頁狀態單一入口：getToken()（localStorage）、getConversationId()/setConversationId()（sessionStorage）
  api.js                API 層：集中封裝全部後端請求（角色資訊、聊天室輪詢、訊息收發/刪除、AI 生成狀態、主人公人設、聊天室刪除）與 Authorization header 組裝
  chat.js                聊天室協調層（183 行）：只做 DOM 查詢、業務模組實例化與依賴接線（wiring）、事件綁定；業務邏輯全部委派給下列 5 個模組
  messageStore.js         訊息陣列的唯一寫入點：createMessageStore() 工廠函式，getAll/setAll/push/replaceOrPush/removeByIds/findById，含 makeFailureMessage() 輔助函式
  messageFormatter.js     純文本轉換工具：escapeHtml()（XSS 逃逸）、formatMessageText()（括弧敘事轉斜體樣式），無 DOM 狀態依賴
  messageSender.js        發送訊息 + 樂觀更新：createMessageSender() 工廠函式，立即顯示使用者訊息與思考中佔位符後非同步 POST 到後端，並啟動 AI 回覆輪詢
  aiResponsePoller.js     AI 回覆輪詢：createAiResponsePoller() 工廠函式，含回合守門（tempUserId 比對，見檔內不變式注釋）與 ID/時間雙軌配對替換邏輯
  conversationManager.js  聊天室生命週期 + 對話層級訊息操作：createConversationManager() 工廠函式，封裝初始化（含輪詢建立狀態）、重啟聊天室、刪除訊息（回溯式）三個職責
  toast.js               懸浮通知（role="status" aria-live="polite"）
  messageMenu.js         訊息三點選單（建立/定位/關閉，定位委派給 menuPosition.js）
  protagonistModal.js    主人公人設彈窗（開關/載入/儲存/焦點管理/Escape 關閉）
  virtualMessageList.js  訊息列表虛擬滾動（DOM 只保留可視區 + 緩衝，不受訊息數量影響效能）
  menuPosition.js        依可用空間定位彈出選單（避免飛出視窗）
  style.css              深色科幻風格、聊天室 UI
```

**本專案沒有 `config-loader.js`**——與 auth/character/lobby 不同，同源部署後 API 一律走相對路徑（`/api/...`），不需要向 gateway 詢問設定；後端可達性由外層 lobby 負責探測。

## UI 結構

- **聊天頭部**（`.chat-header`）：角色頭像/名稱/狀態，右側按鈕：主人公人設（🎭）、刷新聊天頁面（🔄）、重啟聊天室（♻️），皆有 `aria-label`。
- **訊息列表**（`.messages-container` + `.messages-list`）：虛擬滾動渲染，使用者/機器人訊息不同樣式；使用者訊息（非臨時）懸浮顯示三點選單（編輯佔位／刪除，回溯式刪除該訊息及其後所有訊息）。
- **輸入區**（`.chat-input-area`）：多行輸入框，Enter 發送、Shift+Enter 換行。
- **主人公人設彈窗**（`#protagonistModal`）：編輯使用者扮演角色的名稱與背景設定，PUT 到後端（後端先更新 RAG 切片，成功才寫 DB）。具備 `role="dialog"`/`aria-modal`/`aria-labelledby`，開啟時焦點移入名稱欄位、關閉時（✕／點遮罩／Escape）焦點歸還觸發按鈕。
- **初始化懸浮層**（`#initializingOverlay`）：聊天室建立/輪詢/重啟期間顯示，禁用輸入框；`#initializingMessage` 具備 `role="status" aria-live="polite"`。
- **懸浮通知**（toast）：操作失敗時（如刪除被拒、儲存失敗、重啟失敗）短暫顯示 3 秒後自動消失，容器具備 `role="status" aria-live="polite"`。

## 聊天功能（已對接真實後端，非模擬）

- 進頁面即輪詢 `/api/conversations/character/:charId` 直到聊天室就緒（200）或建立失敗（503），最多輪詢 120 次（120 秒）。
- 發送訊息採樂觀更新：立即顯示使用者訊息與「思考中」佔位氣泡，非同步 POST 到後端，再輪詢 `/api/conversations/:id/ai-generation-status` 取得 AI 回覆狀態，完成後用「臨時 ID ↔ 真實 ID」配對資訊替換佔位符（配對缺失時退回時間篩選後備邏輯）。
- 刪除訊息：回溯式刪除（該訊息與其後所有訊息一併刪除），AI 生成中會被後端以 409 拒絕。
- 重啟聊天室：複用既有刪除+建立管線（非專用 restart API）——先刪除舊聊天室（含 RAG 資料與主人公人設），再走建立流程；刪除失敗顯示 toast（非阻塞式 `alert()`）。
- 主人公人設：可讀取/儲存使用者扮演角色的名稱與背景設定。

## 認證與守門機制

- `main.js` 進頁面時解析 URL query string 的 `characterId`，並檢查 `session.js` 的
  `getToken()`（讀共享 `localStorage`）；`characterId` 缺失或未登入（無 token）就導向
  `/login/`。同源部署下與 lobby/auth 共享同一個 origin 的 localStorage，不再需要（也不再
  支援）從網址 `token` 查詢參數接收 token（`direct-token-read` change，2026-08）。
- `getToken()` 供 `chat.js` 內所有 API 呼叫組裝 `Authorization: Bearer` header 使用。

## 鍵盤快捷鍵

- **Enter** — 發送訊息
- **Shift+Enter** — 換行
- **Escape** — 關閉主人公人設彈窗（焦點歸還觸發按鈕）

## 現況補充

- 已建立標準聊天室 UI 框架，聊天邏輯已對接真實後端（非模擬）。
- 有 `.git`（不同於 auth/character，本專案從一開始就是獨立 git repo，且有遠端 `origin/main`）。
- 沒有測試、沒有 lint 設定檔；驗證以 `npm run build`／`grep`／手動瀏覽器走查為主。
- `aria-live`/`aria-label`/`role` 已在 `simplify-chat-ui`（2026-07-26）補齊。

## 演進歷史（重要背景）

依《前端系統設計原則》稽核（見 `mistake.md`）後，以 change `simplify-chat-ui`（2026-07-26）
做了一輪優化：
- 重寫 `src/api.js` 為真正的 API 層（原本內容是零呼叫點的死代碼 `getCurrentUserId()`/
  `decodeToken()`），集中封裝全部後端請求與 `Authorization` header 組裝，解決 API 層與
  UI 層混雜、YAGNI 死代碼、header 組裝重複三項問題。
- 新增 `src/session.js`，把 `token`/`conversationId` 的 `localStorage`/`sessionStorage`
  存取集中成單一入口。
- 把原本 886 行的 `chat.js` 拆分出 `toast.js`／`messageMenu.js`／`protagonistModal.js`
  三個獨立模組，`chat.js` 瘦身為協調層（解決關注點分離違反）。
- 新增 `makeFailureMessage()` 輔助函式，取代 4 處重複的失敗訊息物件建構。
- 補齊可及性：toast／初始化狀態文字加 `aria-live`，主人公人設彈窗加
  `role="dialog"`/`aria-modal`/焦點管理/Escape 關閉，5 個圖示按鈕加 `aria-label`。
- 重啟聊天室失敗的錯誤呈現從阻塞式 `alert()` 改為與刪除/儲存失敗一致的 toast（統一
  錯誤呈現機制；刻意保留 AI 回覆失敗的「失敗氣泡」，因其語意是對話流程的一部分，
  詳見 `openspec/changes/simplify-chat-ui/design.md`）。
- **本輪刻意不處理**：三點選單「編輯」選項維持原樣佔位（刻意的未完成功能，非本輪範圍）。

依《程式撰寫設計原則.md》稽核後，以 change `chat-frontend-code-quality` 做了第二輪優化（拆分依據
是「修改理由是否獨立」而非行數）：
- 原本 655 行的 `chat.js` 依職責邊界拆成 5 個模組：`messageStore.js`（訊息陣列讀寫單一入口）、
  `messageFormatter.js`（純文本轉換）、`messageSender.js`（發送+樂觀更新）、
  `aiResponsePoller.js`（AI 輪詢+回合守門，原有不變式注釋原樣保留）、
  `conversationManager.js`（聊天室生命週期：初始化/重啟/刪除訊息）。
  `chat.js` 精簡為 183 行的協調層，只做 DOM 查詢、模組實例化接線、事件綁定。
- 拆分後的模組沿用專案既有的工廠函式模式（`createXxx(deps) → { methods }`，與
  `virtualMessageList.js`／`protagonistModal.js` 一致），UI 副作用一律透過回呼注入
  （`onRender`／`onInputLock`／`getCharacterName`），邏輯模組不直接碰 DOM。
- 純內部重構，透過 Playwright 對真實後端完整回歸走查（發送、樂觀更新、AI 回覆、回溯式刪除、
  重啟、連續發送的回合守門情境）驗證行為與拆分前一致，全程零 console error。
- 詳見 `openspec/changes/chat-frontend-code-quality/`（design.md 記錄完整決策依據）。

依《網頁架構設計原則》稽核後，以 change `direct-token-read`（2026-08）跟進
`persona-nexus-rpg-scene` 已示範的模式：`main.js` 不再要求網址帶 `?token=` 才能運作（本專案
先前是全平台唯一一個「網址沒 token 就強制導回登入頁」的前端，即使 localStorage 已有合法 token
也一樣），改成直接檢查 `session.js` 的 `getToken()`；`setToken()` 因此變成零呼叫點一併移除。
這是 `persona-nexus-lobby` 同步進行的 `iframe-token-param-removal`（iframe 網址不再帶 token）
的前置依賴——若順序顛倒，舊版 `main.js` 會把已登入使用者誤導向登入頁。透過 Playwright 對真實
後端驗證：網址不帶 token 但 localStorage 有 token 時能正常初始化、localStorage 無 token 與
缺少 characterId 兩種情境都正確導向 `/login/`，全程零 console error。
