# chat-ui Specification

> 本檔是 persona-nexus-chat **當前實際行為**的規格（as-is），逐條對照原始碼撰寫，不做美化、不寫理想版。
> 已納入 change `simplify-chat-ui` 的優化結果（`api.js` 重寫為真正的 API 層、新增
> `session.js`/`toast.js`/`messageMenu.js`/`protagonistModal.js`、補上可及性屬性、
> 重啟失敗改用 toast）。
> 最後對照時間：與 `src/`、`index.html`、`vite.config.js` 現況一致（2026-07-26）。

## Purpose

persona-nexus-chat 是 Persona Nexus 平台的**聊天室頁**，由 `persona-nexus-lobby` 以 iframe
載入，供使用者與已選定的 AI 角色進行對話。負責：聊天室建立/載入、訊息收發、訊息刪除、
主人公人設（使用者扮演角色）編輯、聊天室重啟。本專案不持有角色資料或對話持久化邏輯，
均透過 api-gateway 呼叫後端服務完成。

### 當前架構圖（as-is）

```
瀏覽器
  │
  ▼
http://localhost:8080（Caddy 反向代理，同源入口）
  ├─ /chat/*  ──▶ 本專案 Vite dev server (5176)，由 lobby 以 iframe 嵌入
  │                    │
  │        index.html（單頁：聊天頭部 + 訊息列表 + 輸入區 + 主人公人設彈窗 + 初始化懸浮層）
  │                    │
  │        src/main.js（解析 URL query string 的 characterId/token，經 session.js 寫入 localStorage）
  │           │
  │           └─▶ src/chat.js（initChat()：協調各模組，訊息渲染/發送/輪詢/刪除/重啟主流程）
  │                  ├─▶ src/session.js（getToken/setToken、getConversationId/setConversationId）
  │                  ├─▶ src/api.js（集中封裝全部後端請求 + Authorization header 組裝）
  │                  │      ├─ fetchCharacter／fetchConversationStatus
  │                  │      ├─ postMessage／fetchMessages／fetchGenerationStatus
  │                  │      ├─ deleteMessage／fetchProtagonist／saveProtagonist
  │                  │      └─ deleteConversation
  │                  ├─▶ src/toast.js（懸浮通知，role="status" aria-live="polite"）
  │                  ├─▶ src/messageMenu.js（三點選單，內部用 src/menuPosition.js 定位）
  │                  ├─▶ src/protagonistModal.js（彈窗開關/載入/儲存/焦點管理）
  │                  └─▶ src/virtualMessageList.js（訊息列表虛擬滾動）
  │
  └─ /api/*   ──▶ api-gateway (8000) ──▶ 對應後端服務
```

`src/api.js` 是唯一發出 `fetch()` 的模組，內部集中組裝 `Authorization: Bearer ${token}`
header；`chat.js`／`protagonistModal.js` 皆呼叫 `api.js` 匯出的函式，不直接操作 `fetch`。

## Requirements

### Requirement: 登入守門與參數解析
系統 SHALL 在 `main.js` 載入時，從 URL query string 解析 `characterId` 與 `token` 兩個參數。
若任一參數缺失，系統 MUST 導向 `/login/`，不執行任何聊天室初始化。
若兩者皆存在，系統 SHALL 將 `token` 寫入 `localStorage`（key: `'token'`），再呼叫
`initChat(characterId)`。

#### Scenario: 缺少必要參數
- **WHEN** URL query string 缺少 `characterId` 或 `token`（或兩者皆缺）
- **THEN** `window.location.href` 被設為 `/login/`，`initChat()` 不會被呼叫

#### Scenario: 參數齊全
- **WHEN** URL query string 同時帶有 `characterId` 與 `token`
- **THEN** `token` 被寫入 `localStorage`，`initChat(characterId)` 開始執行

### Requirement: 聊天室初始化（輪詢建立/載入）
系統 SHALL 在初始化時顯示初始化懸浮層並停用輸入框，接著呼叫
`GET /api/characters/:charId` 取得角色名稱（失敗則用 `角色 #<id前8碼>` 佔位），
再輪詢 `GET /api/conversations/character/:charId` 直到聊天室就緒（HTTP 200）或
建立失敗（HTTP 503），最多輪詢 120 次、每次間隔 1 秒。

#### Scenario: 輪詢中（202 preparing）
- **WHEN** 輪詢回應 HTTP 202
- **THEN** 初始化懸浮層文字更新為「聊天室準備中...」，1 秒後再次輪詢

#### Scenario: 聊天室就緒（200）
- **WHEN** 輪詢回應 HTTP 200
- **THEN** `conversationId` 寫入 `sessionStorage`，訊息陣列載入並渲染，角色狀態顯示「線上」，初始化懸浮層撤除、輸入框恢復可用

#### Scenario: 建立失敗（503）
- **WHEN** 輪詢回應 HTTP 503，或超過 120 次仍未就緒
- **THEN** 角色狀態顯示「離線」，初始化懸浮層維持顯示並改為錯誤文案（「聊天室建立失敗，請重新整理頁面再試」），輸入框保持停用

### Requirement: 訊息列表渲染（虛擬滾動）
系統 SHALL 透過 `virtualMessageList.js` 渲染訊息列表，DOM 中只保留可視區與前後緩衝
（`overscan`）範圍內的訊息節點；訊息資料的單一真相由 `chat.js` 的 `messages` 陣列持有，
虛擬滾動模組不複製、不刪除資料。使用者訊息與機器人訊息 SHALL 有不同的視覺樣式與對齊方向。

#### Scenario: 資料變動後同步
- **WHEN** `messages` 陣列被修改後呼叫 `renderMessages()`
- **THEN** 若呼叫前使用者在捲動區底部附近（`nearBottomThreshold` 內），渲染後自動貼底；否則維持使用者當前捲動位置

#### Scenario: 訊息文字內容格式化
- **WHEN** 訊息文字包含全形（）或半形 () 括弧
- **THEN** 括弧內文字（不含括弧本身）以 `.narrative` 樣式（斜體、降低不透明度）呈現，其餘文字先經 HTML escape 再插入 DOM（防止 XSS）

### Requirement: 發送訊息（樂觀更新 + 輪詢 AI 回覆）
系統 SHALL 在使用者送出訊息時立即以臨時 ID（`temp_<timestamp>_<random>`）插入使用者訊息與
「思考中」佔位氣泡到畫面，同時非同步 `POST /api/conversations/:id/messages`（不 await），
接著輪詢 `GET /api/conversations/:id/ai-generation-status` 直到取得 `completed`／`failed`
狀態或超過 120 次（每秒 1 次）。

#### Scenario: 後端拒絕發送
- **WHEN** `POST .../messages` 回應非 2xx
- **THEN** 停止 AI 狀態輪詢，佔位氣泡替換為失敗訊息（含後端回傳的 `message` 或 HTTP 狀態碼），使用者原始訊息保留在畫面上

#### Scenario: AI 生成完成，具備 ID 配對資訊
- **WHEN** 輪詢取得 `status: 'completed'` 且 `generationStatus.assistantMessageId` 存在
- **THEN** 用該 ID 從 `GET .../messages` 的結果中找到對應 AI 訊息取代佔位符；若 `userMessageId` 也存在，一併把臨時使用者訊息換成後端回傳的真實記錄

#### Scenario: AI 生成完成，配對資訊缺失（相容舊後端）
- **WHEN** 輪詢取得 `status: 'completed'` 但無 `assistantMessageId`
- **THEN** 退回時間篩選：取 `role === 'assistant' && status === 'completed' && createdAt > 使用者訊息時間` 中最新一筆取代佔位符

#### Scenario: AI 生成失敗或輪詢超時/中斷
- **WHEN** 輪詢取得 `status: 'failed'`，或達到 120 次上限，或請求拋出例外
- **THEN** 使用者訊息保留，佔位符替換為含錯誤說明的失敗氣泡，停止輪詢並恢復輸入框可用狀態

### Requirement: 刪除訊息（回溯式）
系統 SHALL 提供使用者訊息（非臨時訊息）的刪除功能，透過三點選單觸發，經 `confirm()`
二次確認後呼叫 `DELETE /api/conversations/:id/messages/:messageId`。刪除為回溯式：
該訊息與其後所有訊息一併從後端與畫面移除。

#### Scenario: 刪除成功
- **WHEN** DELETE 回應成功並回傳 `deletedIds`
- **THEN** 本地 `messages` 陣列移除所有 `deletedIds` 對應項並重新渲染

#### Scenario: AI 生成中，刪除被拒（409）
- **WHEN** DELETE 回應 HTTP 409
- **THEN** 顯示懸浮通知（後端回傳的 `message`，或預設「AI 正在回覆中，請稍後再試」），不修改本地訊息陣列

### Requirement: 主人公人設編輯
系統 SHALL 提供彈窗供使用者讀取與編輯「主人公人設」（名稱、背景）。開啟彈窗時
`GET /api/conversations/:id/protagonist` 載入既有設定；儲存時 `PUT` 同端點，成功後關閉
彈窗並顯示懸浮通知。

#### Scenario: 開啟彈窗載入既有設定
- **WHEN** 使用者點擊主人公人設按鈕且聊天室已就緒（`sessionStorage` 有 `conversationId`）
- **THEN** 彈窗顯示，並以 GET 回應內容填入名稱與背景欄位

#### Scenario: 聊天室尚未就緒時點擊
- **WHEN** 使用者點擊主人公人設按鈕但 `sessionStorage` 無 `conversationId`
- **THEN** 顯示懸浮通知「聊天室尚未就緒」，不開啟彈窗

#### Scenario: 儲存成功
- **WHEN** PUT 請求回應成功
- **THEN** 彈窗關閉，顯示懸浮通知「主人公人設已儲存」

### Requirement: 重啟聊天室
系統 SHALL 提供重啟功能：經 `confirm()` 確認後，先 `DELETE /api/conversations/:id`
刪除現有聊天室（含 RAG 資料與主人公人設），成功後重新走聊天室建立輪詢流程
（同「聊天室初始化」需求）。刪除失敗時系統 SHALL 以 `showToast()` 顯示錯誤訊息，
不使用阻塞式的 `alert()`。

#### Scenario: 重啟成功
- **WHEN** 刪除與重新建立皆成功
- **THEN** `conversationId` 更新為新值，訊息陣列替換為新聊天室的初始訊息，懸浮層撤除

#### Scenario: 刪除失敗
- **WHEN** DELETE 回應非 2xx
- **THEN** 顯示 toast 懸浮通知（含錯誤訊息），撤除初始化懸浮層，不進入建立流程

### Requirement: 懸浮通知可及性
`showToast()` 建立的通知容器 SHALL 具備 `role="status"` 與 `aria-live="polite"`，
使輔助科技在通知內容出現時主動朗讀，不需仰賴使用者主動尋找畫面上的視覺提示。

#### Scenario: 螢幕報讀器朗讀懸浮通知
- **WHEN** `showToast(message)` 被呼叫，通知節點插入 DOM
- **THEN** 具備 `aria-live="polite"` 的容器使螢幕報讀器在使用者當前操作空檔朗讀 `message` 內容

### Requirement: 初始化狀態可及性
`#initializingMessage` SHALL 具備 `role="status"` 與 `aria-live="polite"`，使聊天室
建立/輪詢/重啟過程中的狀態文字變化（「聊天室準備中...」、「聊天室建立失敗...」等）
能被螢幕報讀器主動朗讀。

#### Scenario: 螢幕報讀器朗讀初始化狀態
- **WHEN** `showInitializing(message)` 更新 `#initializingMessage` 的文字內容
- **THEN** 具備 `aria-live="polite"` 的容器使螢幕報讀器朗讀新的狀態文字

### Requirement: 主人公人設彈窗可及性
`#protagonistModal` SHALL 具備 `role="dialog"`、`aria-modal="true"`、
`aria-labelledby` 指向彈窗標題。彈窗開啟時系統 MUST 將鍵盤焦點移入彈窗內第一個可互動
欄位；彈窗關閉時（無論透過 ✕ 按鈕、點擊遮罩、或 Escape 鍵）系統 MUST 將焦點歸還給
觸發彈窗的按鈕。系統 SHALL 支援 Escape 鍵關閉彈窗。

#### Scenario: 開啟彈窗時的焦點管理
- **WHEN** 使用者點擊主人公人設按鈕且彈窗成功開啟
- **THEN** 鍵盤焦點移至彈窗內的名稱輸入欄位（`#protagonistNameInput`）

#### Scenario: 關閉彈窗時的焦點歸還
- **WHEN** 彈窗以任何方式關閉（✕ 按鈕、點擊遮罩、Escape 鍵）
- **THEN** 鍵盤焦點歸還給觸發彈窗的按鈕（`#protagonistBtn`）

#### Scenario: Escape 鍵關閉彈窗
- **WHEN** 彈窗開啟中，使用者按下 Escape 鍵
- **THEN** 彈窗關閉，行為與點擊 ✕ 按鈕一致（含焦點歸還）

### Requirement: 圖示按鈕可及名稱
所有僅以圖示（無可見文字）呈現的按鈕（主人公人設、刷新、重啟、訊息三點選單、彈窗關閉）
SHALL 具備 `aria-label` 屬性，提供輔助科技可讀的按鈕名稱；既有的 `title` 屬性 SHALL 保留。

#### Scenario: 螢幕報讀器朗讀圖示按鈕名稱
- **WHEN** 螢幕報讀器使用者以 Tab 鍵移動焦點至任一圖示按鈕
- **THEN** 該按鈕的 `aria-label` 內容被朗讀，使使用者得知按鈕功能而不需仰賴視覺圖示

### Requirement: 刷新聊天頁面
系統 SHALL 在使用者點擊刷新按鈕時執行 `window.location.reload()`，重新載入整個頁面
（含重新初始化聊天室），不影響 lobby 側邊欄。

#### Scenario: 點擊刷新按鈕
- **WHEN** 使用者點擊 `#refreshBtn`
- **THEN** 頁面重新載入

### Requirement: 彈出選單防溢位定位
系統 SHALL 在顯示訊息三點選單時，依錨點按鈕位置與可用視窗空間計算選單座標，避免選單
超出視窗邊界（左右邊界至少留 8px 間距，垂直方向優先顯示於按鈕下方，空間不足時改顯示於上方）。

#### Scenario: 視窗空間足夠
- **WHEN** 按鈕下方有足夠空間容納選單
- **THEN** 選單顯示於按鈕正下方（右緣對齊按鈕右緣）

#### Scenario: 視窗下方空間不足
- **WHEN** 按鈕下方剩餘空間小於選單高度
- **THEN** 選單改顯示於按鈕上方（若上方空間也不足，貼齊視窗底部邊界）

## Non-goals（刻意不在本專案範圍內的行為）

- **`config-loader.js` 式的設定探測**：本專案不向 `/api/config` 探測可達性或索取設定，
  API 一律走寫死的相對路徑常數；後端可達性探測是外層 `persona-nexus-lobby` 的職責。
- **編輯已發送訊息**：三點選單中的「編輯」選項目前僅記錄 log，功能未實作（原始碼註解
  已明講「先佔位」），本檔不將其視為已實裝的行為需求。
- **AI 回覆失敗的「失敗氣泡」不納入本輪錯誤呈現統一範圍**：失敗氣泡是對話流程中的行內
  訊息，語意上與 toast（側邊操作回饋）不同，`simplify-chat-ui` 只統一了 `alert()` →
  toast，刻意保留失敗氣泡（詳見該 change 的 `design.md`）。
