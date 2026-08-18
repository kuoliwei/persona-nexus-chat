## Context

`persona-nexus-chat` 是由 `persona-nexus-lobby` 以 iframe 嵌入的子頁，同源部署（Caddy）下與 lobby/auth 共享同一個瀏覽器 origin，因此 localStorage 本來就是共享的。`persona-nexus-auth` 登入成功後已直接把 token 寫入這個共享的 localStorage（`direct-token-storage` change，2026-08-12），`persona-nexus-rpg-scene` 從一開始就示範了「子頁直接讀 localStorage、完全不解析網址 token」的模式（`src/api.js` 的 `getToken()`）。

`persona-nexus-chat` 的 `main.js` 目前仍走舊模式：從網址 query string 解析 `token`，缺席就導向登入頁，存在就寫入 localStorage 供後續 API 呼叫使用。這是全平台唯一還「要求」網址帶 token 才能運作的前端（character 的 create.js/edit.js 雖然也讀網址 token，但邏輯是「有就寫，沒有也不擋」，不是強制要求）。

`persona-nexus-lobby` 即將把 `iframe-loader.js` 改成不再於 iframe 網址帶 `token` 參數（`getIframeUrl`/`loadIframeWithToken` 目前對三個 iframe 都無條件塞入 `?token=`）。本 change 是那個變更的前置依賴。

## Goals / Non-Goals

**Goals:**
- `main.js` 的登入守門改成直接檢查 localStorage 是否有 token，不再要求網址帶 `token` 參數
- 移除因此變成零呼叫點的 `session.js` 的 `setToken()`
- 讓本專案的行為與 rpg-scene 的既有模式一致，成為 lobby 端變更的安全前置條件

**Non-Goals:**
- 不處理 localStorage vs httpOnly cookie 的存放方案決策（見平台既有記錄，留待專門一輪）
- 不處理 token 生命週期重新設計（refresh/revoke）
- 不修改 `chat.js`／`protagonistModal.js` 對 `getToken()` 的既有呼叫方式（介面不變，行為不變）
- 不在本次變更中修改 `persona-nexus-lobby` 或 `persona-nexus-character`（各自獨立 change）

## Decisions

### 決策 1：登入守門邏輯改為檢查 localStorage，不解析網址 token

**現況（`src/main.js:11-29`）：**
```js
const urlParams = new URLSearchParams(window.location.search);
const characterId = urlParams.get('characterId');
const token = urlParams.get('token');

if (!characterId || !token) {
  window.location.href = `${LOGIN_APP_URL}/`;
} else {
  setToken(token);
  await initChat(characterId);
}
```

**改為：**
```js
const urlParams = new URLSearchParams(window.location.search);
const characterId = urlParams.get('characterId');

if (!characterId || !getToken()) {
  window.location.href = `${LOGIN_APP_URL}/`;
} else {
  await initChat(characterId);
}
```

理由：token 的存在性判斷應該問「使用者是否已登入（localStorage 有沒有 token）」，而不是「網址有沒有帶」。同源部署下這兩者理論上永遠一致（token 一律由 auth 登入時寫入），但語意上前者才是真正要檢查的條件，後者只是舊有的傳遞管道殘留。

**考慮過的替代方案**：保留網址 token 解析作為 localStorage 為空時的 fallback（雙軌並存）。否決理由：這正是本輪要清除的「不必要多一條資料流」本身，若保留就沒有達成「統一機制」的目的，且會讓 lobby 端遲遲無法真正拿掉網址參數（沒人逼真的清乾淨）。

### 決策 2：移除 `session.js` 的 `setToken()`

改動後 `setToken` 在整個 repo 零呼叫點（唯一呼叫點就是 `main.js` 這行）。比照 `persona-nexus-lobby` 先前移除零呼叫點 `setToken()` 的判斷（`auth-token-handoff-cleanup` change）：不因「get/set 對稱性」保留，YAGNI 優先。`getToken()` 保留，因為 `chat.js`／`protagonistModal.js` 仍有多處呼叫。

## Risks / Trade-offs

**[風險] 部署順序顛倒**：若 `persona-nexus-lobby` 先完成「iframe 網址移除 token」的變更，而本專案還沒套用這個 change，舊版 `main.js` 會因為讀不到網址 `token` 參數而把已登入使用者誤導向登入頁。
→ **緩解**：本 change 必須先完成並驗證過，才能讓 lobby 端動手；proposal.md 已明確記錄此依賴順序。由於三個 repo 目前都在同一個工作資料夾下由同一個 session 操作、尚未各自部署，實務風險僅存在於「先動哪個檔案」，只要依序（chat → character → lobby）完成並在最後做一次跨專案端到端驗證即可。

**[風險] localStorage 沒有 token 但網址仍帶著（尚未套用本 change 的舊版 lobby 或快取的舊網址）**：改動後這種情況一樣會被導向登入頁（因為 `getToken()` 為空），行為與現況「網址沒 token 就導向登入頁」一致，不是新增的風險。

## Migration Plan

無需資料庫遷移或後端配合。純前端邏輯調整：
1. 修改 `main.js`、`session.js`
2. 本機驗證（見 tasks.md）
3. 確認本 change 完成後，才通知/繼續 `persona-nexus-lobby` 的對應變更

無需 feature flag 或分階段上線——三個 repo 都在本機開發環境，改完即生效，靠實測 + 依賴順序控制風險，不需要回滾機制（純 git revert 即可）。
