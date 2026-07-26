# persona-nexus-chat 設計稽核記錄（mistake.md）

> **這是什麼**：拿平台的《前端系統設計原則》逐條對照 persona-nexus-chat 的現況（依據 openspec 的
> `changes/chat-ui-foundation/proposal.md`、`design.md` 與 `specs/chat-ui/spec.md`），
> 找出不符原則之處。
>
> **原則**：符合的也如實標出，不硬湊違反；每項標示把握程度（高/中/低）。
> **用途**：作為後續「優化 change」的依據——每個確認的違反點，會轉成一筆規格變更來驅動修正。
> **稽核時間**：2026-07-26。實際跑過 `npm run build`（8 modules transformed，確認 `src/api.js`
> 未被打包）與 `grep` 全 `src/` 驗證呼叫點，非僅憑讀碼推測。本專案無測試框架，Phase 9 驗證
> 將以手動瀏覽器走查為主。

---

## A. 通用軟體設計原則

| 原則 | 判定 | 依據 |
|------|------|------|
| KISS | 大致符合，有備註 | 各模組本身邏輯直觀；唯一的複雜度集中點是 `chat.js`（886 行）把渲染、輪詢、選單、彈窗、toast 等全部邏輯放在同一個函式作用域內——與 B 節「關注點分離」同根因，不重複計分 |
| DRY | ❌ **違反（高把握）** | 兩處具體重複：(1) `Authorization: Bearer ${token}` header 在 `chat.js` 內 10 處 `fetch()` 呼叫各自組裝一次；(2) 「失敗氣泡」物件（`{ id: failure_..., role: 'assistant', text: ..., status: 'failed', isPlaceholder: true }`）在 `sendMessageToBackend` 的 catch、`pollForAIResponse` 的 failed 分支、timeout 分支、catch 分支，四處幾乎逐字重複建構 |
| YAGNI | ❌ **違反（高把握，已用 grep + build 驗證）** | `src/api.js`（`getCurrentUserId()`／`decodeToken()`）整支檔案沒有任何檔案 import 它；`npm run build` 顯示只有 8 個 modules 被 transform，`api.js` 不在其中——確認是純粹的死代碼，不只是「沒被呼叫」，是完全脫離資料流的孤兒模組 |
| SSOT | ⚠️ **部分違反（中把握）** | `token`（`localStorage`）與 `conversationId`（`sessionStorage`）的讀寫直接散落在 `main.js`／`chat.js` 多處呼叫 `getItem`/`setItem`，沒有集中的存取函式；具體體現見下方 B 節「狀態管理單一入口」 |

## B. 前端架構與模組化原則

| 原則 | 判定 | 依據 |
|------|------|------|
| 關注點分離 SoC | ⚠️ **部分違反（中把握）** | `chat.js` 的 `initChat()` 單一函式作用域內混雜：訊息渲染、發送/輪詢邏輯、刪除訊息、三點選單、主人公人設彈窗、toast 通知、重啟流程——全部共用同一組閉包變數，無任何內部模組切分 |
| 漸進增強 | 不適用 | 聊天室互動（即時收發訊息）本質上依賴 JS 執行，不存在「JS 失效仍可用」的基礎版本，此原則對此類功能不構成有意義的檢查點 |
| 最低能力原則 | ✅ 符合 | 未見以 JS 重造瀏覽器原生就有的能力 |
| 模組邊界／資訊隱藏 | ✅ **符合，值得肯定** | `virtualMessageList.js`（工廠函式 `createVirtualMessageList()`，內部狀態 `Map`/`spacer` 皆不外流，只回傳 `{ sync, scrollToBottom, isNearBottom, destroy }`）與 `menuPosition.js`（純函式 `positionMenu()`，無副作用之外的狀態）是平台目前看過最乾淨的模組化範例 |
| API 層與 UI 層分離 | ❌ **違反（高把握）** | 全部 10 處 `fetch()` 呼叫（角色資訊、聊天室輪詢、訊息送出/取得/刪除、AI 生成狀態、主人公人設 GET/PUT、聊天室刪除）直接寫在 `chat.js` 的 DOM 事件處理與輪詢函式內；`src/api.js` 雖存在但內容與這些請求完全無關（見上方 YAGNI），未承擔 API 層的角色 |
| 狀態管理單一入口 | ❌ **違反（中把握）** | `token` 由 `main.js` 寫入 `localStorage`，`chat.js` 內在 `initChat()` 頂層直接讀出成閉包變數；`conversationId` 在 `chat.js` 的 5 處函式（`initializeChat`／`deleteMessage`／`sendMessage`／`restartBtn` handler／`protagonistBtn` handler／`protagonistSaveBtn` handler）各自直接呼叫 `sessionStorage.getItem('conversationId')`，無集中的 `getToken()`/`getConversationId()` 之類存取函式 |

## C. 效能與資源管理

| 原則 | 判定 | 依據 |
|------|------|------|
| Core Web Vitals | ✅ 符合 | 頁面內容輕量，無阻塞性大型資源；無圖片資產 |
| Bundle Hygiene | ✅ **符合（已用 `npm run build` 實測驗證）** | `dist/` 僅 3 個檔案（index.html + 1 css 6.36kB + 1 js 19.17kB），8 modules transformed；`src/api.js` 因無 import 點，Vite 的 module graph 本來就不會收進產物，死代碼問題只計入 YAGNI，不重複計入本項 |
| 資源快取與版本化 | ✅ 符合（已實測） | build 產物檔名為 `index-DXW1tWkb.css`、`index-Cwdz7_qI.js`，確認 Vite 預設 content hash 機制生效 |
| 環境設定外部化 | ✅ **符合，值得肯定** | 本專案沒有 `config-loader.js`，API 一律走寫死的相對路徑常數（`/api/...`）——這正是 `persona-nexus-lobby` 已驗證、`persona-nexus-auth`／`persona-nexus-character` 優化後才追上的新模式；`persona-nexus-chat` 從一開始就是這套模式，不需要為此變更 |

## D. 可及性與使用者體驗一致性

| 原則 | 判定 | 依據 |
|------|------|------|
| WCAG | ❌ **違反（高把握）** | 整個專案（`index.html` + `src/`）**完全沒有任何** `aria-live`／`aria-label`／`role` 屬性——比 auth/character 各自只缺一處更嚴重，是系統性缺失。具體影響：(1) toast 懸浮通知（唯一的刪除/儲存失敗回饋管道）不會被螢幕報讀器朗讀；(2) 初始化懸浮層文字變化（「準備中」/「重啟中」/錯誤訊息）無 `aria-live`；(3) 主人公人設彈窗無 `role="dialog"`／`aria-modal`／焦點管理／Escape 鍵關閉；(4) 5 個圖示按鈕（🎭/🔄/♻️/⋮/✕）僅靠 `title` 屬性，未提供 `aria-label` |
| 一致性與標準 | ⚠️ **部分違反（中把握）** | 錯誤呈現機制三種並存、無統一規則：訊息發送失敗用「失敗氣泡」（畫在訊息列表內）、刪除/儲存失敗用 toast（3 秒自動消失）、重啟失敗用瀏覽器原生 `alert()`（阻塞式）。三者風格與持續時間差異大，且 `alert()` 與同平台其他前端（auth/character 用固定文案的訊息框）風格不一致 |
| 錯誤預防與明確回饋 | ✅ 符合，值得肯定 | 破壞性操作（刪除訊息、重啟聊天室）皆有 `confirm()` 二次確認；錯誤訊息具體且來自後端 `message` 欄位，未見暴露 stack trace 或內部技術細節 |

---

## 稽核結論：確認的候選違反點（按把握度排序）

> **處理狀態**：使用者核對後決定**全部 7 項納入本輪處理**。已由 change `simplify-chat-ui`
> 處理完成（2026-07-26），並通過 `npm run build`／`grep` 驗證；手動瀏覽器走查留給使用者
> 自行確認（需完整 Caddy + gateway + 後端服務）。

| # | 違反的原則 | 事實 | 把握 | 狀態 |
|---|-----------|------|------|------|
| 1 | **WCAG（可及性）** | 全專案零 `aria-live`/`aria-label`/`role`；toast、彈窗、初始化懸浮層、圖示按鈕皆受影響 | 高 | ✅ 已補齊（toast/初始化狀態加 `aria-live`，彈窗加 `role="dialog"`/`aria-modal`/焦點管理/Escape，圖示按鈕加 `aria-label`） |
| 2 | **API 層與 UI 層分離** | 10 處 `fetch()` 直接寫在 `chat.js`，無 `api.js` 承擔封裝角色 | 高 | ✅ 已重寫 `src/api.js` 封裝全部 9 個端點，`chat.js`/`protagonistModal.js` 改呼叫對應函式 |
| 3 | **YAGNI** | `src/api.js` 整支死代碼，`grep` 與 `build` 皆確認零呼叫點、零打包 | 高 | ✅ 已移除 `getCurrentUserId()`/`decodeToken()`，`api.js` 重新用於實際 API 層 |
| 4 | **DRY** | Authorization header 組裝（10 處）、失敗訊息物件建構（4 處）重複 | 高 | ✅ header 組裝集中進 `api.js` 的 `authHeaders()`；新增 `makeFailureMessage()`/`replaceOrPushMessage()` 輔助函式取代重複建構 |
| 5 | **狀態管理單一入口（SSOT 具體體現）** | `token`/`conversationId` 的 `localStorage`/`sessionStorage` 存取分散在 `main.js`/`chat.js` 多處，無集中存取函式 | 中 | ✅ 已新增 `src/session.js`，`main.js`/`chat.js` 改呼叫 `getToken()`/`setToken()`/`getConversationId()`/`setConversationId()` |
| 6 | **關注點分離 SoC** | `chat.js` 單一函式作用域混雜渲染/輪詢/選單/彈窗/toast/重啟等多重角色 | 中 | ✅ 拆出 `toast.js`／`messageMenu.js`／`protagonistModal.js`，`chat.js` 瘦身為協調層 |
| 7 | **一致性與標準（Nielsen）** | 錯誤呈現機制三種並存（失敗氣泡/toast/`alert()`）無統一規則 | 中 | ✅ 重啟失敗改用 toast，取代 `alert()`；刻意保留失敗氣泡（語意不同，詳見 `design.md`） |

## 做得好、不該動的部分

- **環境設定外部化／架構方向**：本專案從一開始就採用 lobby 驗證過的相對路徑新模式，無需為此變更（auth/character 反而是後來才追上）
- **模組邊界**：`virtualMessageList.js`、`menuPosition.js` 是平台目前最乾淨的模組化範例
- **Bundle Hygiene／資源快取**：已用 `npm run build` 實測驗證，皆符合
- **XSS 防護**：`escapeHtml()` 正確使用，訊息文字先跳脫再插入 DOM
- **錯誤預防**：破壞性操作皆有二次確認；錯誤訊息具體且不暴露技術細節

---

## 誠實提醒

- **第 7 點（一致性）把握中，非高**：三種錯誤呈現機制是否要統一，涉及設計取捨（例如
  `alert()` 阻塞式是否對「重啟聊天室」這種需要使用者立即注意的錯誤反而合理），非單純的
  技術對錯，需要使用者裁示要不要統一、統一成哪一種。
- **三點選單的「編輯」選項是已知的功能缺口，但不計入本次違反點**：原始碼註解已明講
  「功能未實作，先佔位」，屬於刻意的、有記錄的未完成功能，不是稽核意外發現的隱藏問題；
  是否要隱藏該選項或實作編輯功能，是產品範圍決定，不在《前端系統設計原則》的稽核範圍內。
- **本專案無測試框架**：不同於 auth（Jest + jsdom），沒有單元測試可跑，Phase 9 若走到實作
  階段，驗證會更依賴手動瀏覽器走查與 `npm run build`／`grep`，這點與《前端專案優化進度.md》
  記錄的「與後端 SOP 差異」一致（前端 Phase 9 本來就以瀏覽器實測為主）。
- **KISS 與 SoC 為同一根因，只計分一次**：`chat.js` 的複雜度集中問題已計入「關注點分離」，
  未在 KISS 一列重複列為違反，避免同一件事灌水成兩個違反點。
