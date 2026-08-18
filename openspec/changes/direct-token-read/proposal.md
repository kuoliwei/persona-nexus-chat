## Why

平台正在把 token 傳遞機制從「URL query string 交接」統一改為「直接讀共享 localStorage」（persona-nexus-auth 已於 `direct-token-storage` change 完成登入端的部分，persona-nexus-rpg-scene 從一開始就是這個模式的示範服務）。目前 `persona-nexus-chat` 仍要求網址帶 `?token=`，否則直接判定使用者未登入並導向登入頁——這與同源部署（Caddy）下 localStorage 本來就跨微前端共享的事實不符，也讓 token 不必要地出現在 iframe 網址、瀏覽器 history 與 server log 裡。這是 lobby 端即將進行的「iframe-loader.js 停止在網址帶 token」變更的前置依賴：若 lobby 先動，本專案現有邏輯會誤判已登入使用者為未登入。

## What Changes

- `main.js` 的登入守門邏輯改為：只從 URL query string 解析 `characterId`；token 存在與否改成直接檢查 `localStorage`（透過 `session.js` 既有的 `getToken()`），不再解析網址裡的 `token` 參數、也不再把它寫回 localStorage。
- 移除 `session.js` 的 `setToken()`——此變更後零呼叫點（YAGNI，比照 lobby 先前移除零呼叫點 `setToken()` 的判斷）。
- **BREAKING（僅限尚未跟進的舊版 lobby）**：若 lobby 端尚未更新、仍只靠網址帶 token 而使用者 localStorage 中沒有既存 token（理論上不會發生，因為 token 一律由 auth 登入時寫入 localStorage），則會被導向登入頁。正常流程下無影響。

## Capabilities

### Modified Capabilities
- `chat-ui`：「登入守門與參數解析」需求變更——不再要求 URL 帶 `token` 參數，改為檢查 localStorage 既有 token。

## Impact

- `src/main.js`（登入守門邏輯、import 調整）
- `src/session.js`（移除 `setToken`）
- 不影響 `chat.js`／`protagonistModal.js`（仍呼叫 `getToken()`，介面不變）
- 依賴前提：本 change 必須先於 `persona-nexus-lobby` 對應的「iframe 網址移除 token 參數」變更完成並驗證，才能讓 lobby 動手（否則順序顛倒會導致已登入使用者被誤導向登入頁）
