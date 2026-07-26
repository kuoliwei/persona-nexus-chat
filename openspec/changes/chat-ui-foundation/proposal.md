## Why

> 這是一份**回溯性提案（retrospective proposal）**：persona-nexus-chat 已經實作完成並運作，
> 本文反推「當初若有正式提案，會怎麼寫」，補上行為規格（main spec）沒有記錄的**動機與範圍**。

Persona Nexus 平台採多頁前端架構，使用者在大廳選定 AI 角色後，需要一個**專責的聊天室頁**：
渲染對話、收發訊息、管理聊天室生命週期（建立/重啟）、讓使用者編輯「主人公人設」（自己
扮演的角色設定）。這些是「已登入且已選角色」之後的體驗，與大廳（角色列表、首頁）、
登入頁（帳密驗證）在使用者旅程上明顯是不同階段，因此獨立成一個前端專案。

為什麼由 lobby 以 iframe 載入，而不是像 auth 一樣整頁導向？

- 聊天室需要與 lobby 的側邊欄（對話列表）共存於同一畫面，使用者切換角色對話時不需要
  整頁重新載入 lobby 的其餘介面。
- `characterId`／`token` 因此透過 URL query string（iframe 的 `src`）傳入，而非像
  auth→lobby 那樣走整頁跳轉後由對方解析 query string 再清除。

## What Changes

建立 persona-nexus-chat，提供並僅提供以下能力：

- **聊天室建立/載入**：輪詢 `/api/conversations/character/:id` 直到就緒。
- **訊息收發**：樂觀更新 + 輪詢 AI 生成狀態，支援臨時 ID 與後端真實 ID 的配對替換。
- **訊息刪除**：回溯式刪除（該訊息與其後所有訊息一併移除），AI 生成中拒絕刪除。
- **主人公人設**：讀取/編輯使用者扮演角色的名稱與背景。
- **聊天室重啟**：刪除現有聊天室後重新走建立流程。
- **虛擬滾動渲染**：DOM 只保留可視區訊息節點，不受訊息總數影響效能。

**刻意不做（非本專案範圍）：**

- **不做 `config-loader.js` 式的設定探測**：API 一律走相對路徑，後端可達性探測是 lobby 的職責。
- **不實作訊息編輯**：三點選單的「編輯」選項僅為 UI 佔位，點擊只記錄 log。
- **不做 WebSocket 即時通訊**：AI 回覆採輪詢（polling）取得，非長連線推送。

## Impact

**新增對外依賴的 API 契約（由後端提供，本專案為消費方）：**
- `GET /api/characters/:id` → 角色資訊（含 `name`）
- `GET /api/conversations/character/:id` → 200 就緒 / 202 準備中 / 503 建立失敗
- `POST /api/conversations/:id/messages` → 送出訊息；`GET` 同端點取得訊息列表
- `GET /api/conversations/:id/ai-generation-status` → AI 生成狀態輪詢
- `DELETE /api/conversations/:id/messages/:msgId` → 刪除訊息（回溯式）；409 表示生成中拒絕
- `GET`/`PUT /api/conversations/:id/protagonist` → 主人公人設
- `DELETE /api/conversations/:id` → 刪除聊天室（重啟流程用）

**新增外部依賴：**
- **api-gateway**（經 Caddy 同源代理）— 所有後端請求的唯一入口。
- **persona-nexus-lobby** — 以 iframe 載入本專案，並負責在載入前確保 token 有效。

**技術棧：**
- Vite 8（build tool，無 UI 框架）；無測試框架、無 lint 設定。

**行為契約詳見** `openspec/specs/chat-ui/spec.md`（現況基準線規格）。
**架構決策與取捨詳見** 同目錄 `design.md`。
