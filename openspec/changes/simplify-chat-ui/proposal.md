## Why

依《前端系統設計原則》稽核 `persona-nexus-chat`（見 `mistake.md`）找到的 7 項候選違反點，
使用者核對後**全部納入本輪處理**：

1. WCAG（高把握）：全專案零 `aria-live`/`aria-label`/`role`
2. API 層與 UI 層分離（高把握）：10 處 `fetch()` 直接寫在 `chat.js`
3. YAGNI（高把握）：`src/api.js` 整支死代碼，零呼叫點
4. DRY（高把握）：Authorization header 組裝（10 處）、失敗訊息物件建構（4 處）重複
5. 狀態管理單一入口（中把握）：`token`/`conversationId` 存取分散無集中函式
6. 關注點分離 SoC（中把握）：`chat.js`（886 行）單一函式混雜多重角色
7. 一致性與標準 Nielsen（中把握）：錯誤呈現機制三種並存（失敗氣泡/toast/`alert()`）無統一規則

## What Changes

- **重寫 `src/api.js` 為真正的 API 層**：移除死代碼 `getCurrentUserId()`/`decodeToken()`
  （解決第 3 項），改為封裝全部 9 個後端端點（角色資訊、聊天室輪詢單次探測、訊息送出/取得/
  刪除、AI 生成狀態、主人公人設 GET/PUT、聊天室刪除），內部集中組裝 `Authorization` header
  （解決第 4 項 header 重複、第 2 項 API/UI 分離）。維持 chat.js 內既有的輪詢迴圈/計時器邏輯
  不動，只把「單次 fetch」抽出去。
- **新增 `src/session.js`**：集中 `getToken()`/`setToken()`（包 `localStorage`）與
  `getConversationId()`/`setConversationId()`（包 `sessionStorage`），`main.js`/`chat.js`
  改呼叫這些函式，不再各自直接 `localStorage`/`sessionStorage` 存取（解決第 5 項）。
- **拆分 `chat.js` 為多個模組**（解決第 6 項 SoC）：
  - `src/toast.js`：`showToast(message)` 懸浮通知
  - `src/messageMenu.js`：三點選單的建立/定位/關閉邏輯
  - `src/protagonistModal.js`：主人公人設彈窗的開關/載入/儲存邏輯
  - `chat.js` 保留：`initChat()` 主流程、訊息渲染（含虛擬滾動整合）、發送/輪詢 AI 回覆、
    刪除訊息、重啟聊天室——變成協調各模組的入口，不再身兼全部角色。
- **新增失敗訊息建構輔助函式**（`chat.js` 內的 `makeFailureMessage(text)`），取代 4 處
  幾乎逐字重複的物件建構（解決第 4 項另一半）。
- **可及性補強**（解決第 1 項）：
  - Toast 容器加上 `role="status" aria-live="polite"`。
  - 主人公人設彈窗加上 `role="dialog" aria-modal="true" aria-labelledby`，開啟時把焦點移入
    第一個欄位、關閉時歸還焦點給觸發按鈕，並支援 Escape 鍵關閉。
  - 初始化懸浮層的 `#initializingMessage` 加上 `role="status" aria-live="polite"`。
  - 5 個圖示按鈕（🎭/🔄/♻️/⋮/✕）補上 `aria-label`（`title` 保留，兩者不衝突）。
- **統一錯誤呈現機制**（解決第 7 項）：重啟聊天室失敗的顯示方式從阻塞式 `alert()` 改為
  與刪除/儲存失敗一致的 `showToast()`；保留「失敗氣泡」作為 AI 回覆流程專屬的**行內**呈現
  （因為它取代的是對話流程中的一則訊息，語意上是對話的一部分，與側邊通知性質不同，不視為
  需要統一掉的第三種機制——詳見 `design.md` 的說明）。

**刻意不做（範圍排除）：**
- **不實作訊息編輯**：三點選單「編輯」選項維持原樣佔位，`mistake.md` 已記錄這是刻意的
  未完成功能，非本輪稽核範圍（見 `mistake.md`「誠實提醒」）。
- **不新增測試框架**：本專案本來就沒有 Jest 之類的單元測試，本輪不引入新的測試基礎設施，
  Phase 9 驗證以 `npm run build`/`grep`/手動瀏覽器走查為主。

## Impact

**可觀察行為變更：**
- 重啟聊天室失敗時，錯誤呈現從瀏覽器原生 `alert()`（阻塞式對話框）改為 toast 懸浮通知
  （3 秒後自動消失，不阻塞頁面）。
- 新增可及性行為：toast、初始化狀態文字、主人公人設彈窗的內容變化現在會被螢幕報讀器
  主動朗讀；彈窗開啟/關閉現在會管理鍵盤焦點；圖示按鈕現在有 `aria-label`。
- 以上皆為**新增或替換**行為，不影響滑鼠/一般操作路徑下的既有結果（重啟成功、發送/刪除
  訊息、主人公人設讀寫等核心邏輯的 API 呼叫、狀態轉換皆不變）。

**不影響行為（純重構/清理）：**
- `src/api.js` 重寫、`session.js` 新增、`chat.js` 拆分成多模組、失敗訊息建構輔助函式抽取：
  皆為內部結構調整，呼叫的 HTTP method/路徑/請求格式與現況完全相同，使用者操作結果不變。

**行為契約詳見** `openspec/specs/chat-ui/spec.md` 的 MODIFIED / ADDED delta。
**架構決策與模組拆分細節詳見** 同目錄 `design.md`。
