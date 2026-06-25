# persona-nexus-chat

聊天室前端，使用者在此與 AI 角色進行對話。Vite + Vanilla JS，無框架。Port 5176（已用 `vite.config.js` 固定 + `strictPort: true`）。

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
index.html              聊天室主頁面
vite.config.js          Vite 配置，固定 port 5176
package.json            依賴管理
src/
  main.js               登入守門、初始化入口
  api.js                JWT 解碼、getCurrentUserId()
  config-loader.js      載入全域配置（從 gateway 的 /api/config）
  chat.js               聊天室邏輯、訊息渲染、事件處理
  style.css             深色科幻風格、聊天室 UI
```

## UI 結構

- **聊天頭部**（.chat-header）
  - 角色信息區：頭像、角色名稱、狀態
  - 頭部按鈕：返回首頁（⌂）

- **訊息列表**（.messages-container）
  - 訊息動態渲染
  - 支援用戶訊息和機器人訊息不同樣式
  - 自動滾動到最新訊息

- **輸入區**（.chat-input-area）
  - 多行文本輸入框
  - 支援 Shift+Enter 換行，Enter 發送
  - 發送按鈕

## 聊天功能

目前實裝：
- 聊天訊息渲染（用戶 vs 機器人訊息）
- 訊息發送邏輯
- 自動回應示例（模擬）
- 返回首頁按鈕

待實裝：
- 真實聊天 API 連接（需後端聊天服務）
- WebSocket 實時通訊（可選，取決於架構）
- 角色信息動態載入
- 訊息歷史保存
- 輸入框自動高度調整

## 認證與守門機制

- `getCurrentUserId()`（`api.js`）：解碼 `localStorage` 裡的 JWT payload，取 `id`；沒有 token 或解碼失敗回 `null`。
- `main.js` 進頁面時會先呼叫 `getCurrentUserId()`，未登入則導向 `http://localhost:5173/`（登入頁）。

## 鍵盤快捷鍵

- **Enter** — 發送訊息
- **Shift+Enter** — 換行

## 現況補充

- 已建立標準聊天室 UI 框架
- 聊天訊息邏輯實裝（本地訊息管理）
- 還需要連接後端 API
- 沒有 git（`.git` 不存在）
- 沒有測試、沒有 lint 設定檔
