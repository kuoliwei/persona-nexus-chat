# Tasks — simplify-chat-ui

## 行為變更（風險較高，先做、先隔離）

- [ ] T1. `index.html`：主人公人設彈窗加上 `role="dialog" aria-modal="true"
      aria-labelledby="protagonistModalTitle"`（給 `<h3>` 加對應 `id`）；
      `#initializingMessage` 加上 `role="status" aria-live="polite"`；
      5 個圖示按鈕（🎭/🔄/♻️/⋮/✕）補上 `aria-label`（`⋮` 是動態產生的按鈕，於
      `messageMenu.js`／`chat.js` 產生處補上）
- [ ] T2. 新增 `src/toast.js`：`showToast(message)`，通知容器加 `role="status"
      aria-live="polite"`
- [ ] T3. 新增 `src/protagonistModal.js`：把 `chat.js` 內主人公人設彈窗的開關/載入/儲存
      邏輯搬過來，並新增：
  - [ ] T3.1 開啟時焦點移入 `#protagonistNameInput`
  - [ ] T3.2 關閉時（✕／遮罩／Escape）焦點歸還 `#protagonistBtn`
  - [ ] T3.3 新增 Escape 鍵關閉的 `keydown` 監聽
- [ ] T4. `chat.js` 的重啟失敗處理：`alert(...)` 改為 `showToast(...)`

## 行為不變（清理與重構，後做）

- [ ] T5. 重寫 `src/api.js`：移除 `getCurrentUserId()`/`decodeToken()`，新增：
  - [ ] T5.1 `authHeaders(token, { json } = {})` 內部輔助函式
  - [ ] T5.2 `fetchCharacter(characterId, token)`
  - [ ] T5.3 `fetchConversationStatus(characterId, token)`
  - [ ] T5.4 `postMessage(conversationId, text, tempUserId, token)`
  - [ ] T5.5 `fetchMessages(conversationId, token)`
  - [ ] T5.6 `fetchGenerationStatus(conversationId, token)`
  - [ ] T5.7 `deleteMessage(conversationId, messageId, token)`
  - [ ] T5.8 `fetchProtagonist(conversationId, token)`
  - [ ] T5.9 `saveProtagonist(conversationId, name, background, token)`
  - [ ] T5.10 `deleteConversation(conversationId, token)`
- [ ] T6. 新增 `src/session.js`：`getToken()`/`setToken()`（`localStorage`）、
      `getConversationId()`/`setConversationId()`（`sessionStorage`）
- [ ] T7. 新增 `src/messageMenu.js`：把 `showMessageMenu()`/`dismissOpenMenu` 邏輯搬過來，
      改用 `menuPosition.js` 定位（不變），對外暴露 `showMessageMenu(anchorBtn, messageId,
      { onDelete })`
- [ ] T8. 改寫 `src/main.js`：`localStorage.setItem('token', ...)` 改呼叫
      `session.js` 的 `setToken()`
- [ ] T9. 改寫 `src/chat.js`：
  - [ ] T9.1 移除已搬到 `toast.js`/`messageMenu.js`/`protagonistModal.js` 的邏輯，
        改為 import 並呼叫
  - [ ] T9.2 全部 `localStorage`/`sessionStorage` 直接存取改呼叫 `session.js`
  - [ ] T9.3 全部 `fetch()` 呼叫改呼叫 `api.js` 對應函式
  - [ ] T9.4 新增 `makeFailureMessage(text)`，取代 4 處重複的失敗訊息物件建構
- [ ] T10. 確認 `virtualMessageList.js`／`menuPosition.js` 不受影響（無需修改，僅確認
      import 路徑在拆分後依然正確）

## 驗證

- [ ] T11. `npm run build` 正常，檢查 `dist/` 內容（模組數量、無殘留對舊 `api.js`
      死代碼的引用）
- [ ] T12. `grep` 全 `src/` 確認：
  - [ ] T12.1 無殘留 `getCurrentUserId`/`decodeToken` 呼叫或引用
  - [ ] T12.2 無殘留直接 `localStorage`/`sessionStorage` 存取（`session.js` 內部除外）
  - [ ] T12.3 無殘留 `alert(` 呼叫
- [ ] T13. 手動瀏覽器走查（需接完整 Caddy + gateway + 後端服務）：
  - [ ] T13.1 聊天室建立/載入、發送訊息（成功/失敗）、AI 回覆輪詢
  - [ ] T13.2 刪除訊息（成功、409 生成中拒絕）
  - [ ] T13.3 主人公人設開啟/載入/儲存，含 Escape 關閉與焦點歸還
  - [ ] T13.4 重啟聊天室（成功、失敗時確認顯示 toast 而非 alert）
  - [ ] T13.5 用瀏覽器 DevTools 或螢幕報讀器確認 `aria-live`/`aria-label`/`role`
        屬性確實存在於對應 DOM 節點
  - [ ] T13.6 Network 分頁確認實際打的 API 路徑與現況一致

## 回寫規格

- [ ] T14. 把本 change 的 delta 同步進 `openspec/specs/chat-ui/spec.md`（含更新架構圖
      反映 `api.js`/`session.js`/`toast.js`/`messageMenu.js`/`protagonistModal.js` 的新結構）
- [ ] T15. 更新 `CLAUDE.md`（檔案結構、演進歷史加一筆）
- [ ] T16. 在 `mistake.md` 標記各項已處理
