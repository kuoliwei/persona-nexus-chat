## MODIFIED Requirements

### Requirement: 登入守門與參數解析
系統 SHALL 在 `main.js` 載入時，從 URL query string 解析 `characterId` 參數，並檢查
`localStorage`（key: `'token'`）是否存在合法 token。若 `characterId` 缺失，或
`localStorage` 沒有 token，系統 MUST 導向 `/login/`，不執行任何聊天室初始化。
若兩者皆存在，系統 SHALL 呼叫 `initChat(characterId)`；系統不再解析或處理 URL query
string 裡的 `token` 參數。

#### Scenario: 缺少 characterId
- **WHEN** URL query string 缺少 `characterId`
- **THEN** `window.location.href` 被設為 `/login/`，`initChat()` 不會被呼叫

#### Scenario: localStorage 沒有 token
- **WHEN** URL query string 帶有 `characterId`，但 `localStorage` 沒有 `token`
- **THEN** `window.location.href` 被設為 `/login/`，`initChat()` 不會被呼叫

#### Scenario: 已登入且 characterId 齊全
- **WHEN** URL query string 帶有 `characterId`，且 `localStorage` 已有合法 `token`
- **THEN** `initChat(characterId)` 開始執行，不論網址是否額外帶有 `token` 查詢參數
