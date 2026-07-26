# Design — simplify-chat-ui

> 記錄本次優化改動後的結構，前後對照。

## 變更前 / 變更後架構對照

**變更前：**
```
main.js
  └─ 解析 URL 參數 → localStorage.setItem('token', ...) 直接存取 → initChat()

chat.js（886 行，單一函式作用域）
  ├─ 直接 localStorage.getItem('token') / sessionStorage.getItem/setItem('conversationId')
  ├─ 10 處 fetch()，各自組裝 Authorization header
  ├─ 4 處幾乎逐字重複的「失敗訊息物件」建構
  ├─ showToast()（懸浮通知，內嵌定義）
  ├─ showMessageMenu()/dismissOpenMenu（三點選單，內嵌定義）
  ├─ 主人公人設彈窗的開關/載入/儲存（內嵌定義）
  ├─ 重啟失敗 → alert()；刪除/儲存失敗 → showToast()；AI 回覆失敗 → 失敗氣泡（三種機制並存）
  └─ import { createVirtualMessageList } from virtualMessageList.js
     import { positionMenu } from menuPosition.js

api.js（死代碼，無人 import）
  └─ getCurrentUserId() / decodeToken()

index.html
  └─ 零 aria-live / aria-label / role
```

**變更後：**
```
session.js（新增）
  ├─ export function getToken() / setToken(token)       — 包 localStorage
  └─ export function getConversationId() / setConversationId(id) — 包 sessionStorage

api.js（重寫，取代死代碼）
  ├─ function authHeaders(token, { json = false } = {})  — 集中組裝 Authorization（+ Content-Type）
  ├─ export function fetchCharacter(characterId, token)
  ├─ export function fetchConversationStatus(characterId, token)   — 單次探測，輪詢迴圈留在 chat.js
  ├─ export function postMessage(conversationId, text, tempUserId, token)
  ├─ export function fetchMessages(conversationId, token)
  ├─ export function fetchGenerationStatus(conversationId, token)
  ├─ export function deleteMessage(conversationId, messageId, token)
  ├─ export function fetchProtagonist(conversationId, token)
  ├─ export function saveProtagonist(conversationId, name, background, token)
  └─ export function deleteConversation(conversationId, token)

toast.js（新增）
  └─ export function showToast(message)     — role="status" aria-live="polite" 容器

messageMenu.js（新增）
  └─ export function showMessageMenu(anchorBtn, messageId, { onDelete, onEdit }) — 用 menuPosition.js 定位

protagonistModal.js（新增）
  └─ export function initProtagonistModal({ getConversationId, getToken })
     回傳 { open() }，內部處理載入/儲存/焦點管理/Escape 關閉

chat.js（瘦身為協調層）
  ├─ import { getToken, getConversationId, setConversationId } from session.js
  ├─ import * as api from api.js
  ├─ import { showToast } from toast.js
  ├─ import { showMessageMenu } from messageMenu.js
  ├─ import { initProtagonistModal } from protagonistModal.js
  ├─ function makeFailureMessage(text) — 取代 4 處重複的失敗訊息物件建構
  ├─ initChat()：訊息渲染、發送/輪詢 AI 回覆、刪除訊息、重啟聊天室（呼叫 api.js 的對應函式）
  └─ 重啟失敗 → showToast()（不再用 alert()）

main.js
  └─ 解析 URL 參數 → session.js 的 setToken() → initChat()

index.html
  ├─ toast 容器（動態插入時帶 role="status" aria-live="polite"，見 toast.js）
  ├─ #initializingMessage 加 role="status" aria-live="polite"
  ├─ #protagonistModal 加 role="dialog" aria-modal="true" aria-labelledby="protagonistModalTitle"
  └─ 5 個圖示按鈕補上 aria-label（title 保留）
```

## 為什麼 `fetchConversationStatus` 只做單次探測，輪詢迴圈留在 `chat.js`

`pollForConversation()`／`pollForAIResponse()` 內含計時器控制（`for`+`sleep` 與
`setInterval`）、懸浮層文字更新、UI 狀態轉換等協調邏輯，屬於「這個頁面怎麼呈現輪詢過程」
的行為，不是「怎麼打這一次 API」的細節。仿照 auth 的 `api.js` 只封裝單次 `fetch`、不吃掉
呼叫端的流程控制邏輯的做法，`api.js` 只提供 `fetchConversationStatus()`/`fetchGenerationStatus()`
兩個單次探測函式，輪詢的 for/setInterval 迴圈保留在 `chat.js`。

## 為什麼失敗氣泡不算進「錯誤呈現不一致」要統一的範圍

`mistake.md` 第 7 項原本列出三種錯誤呈現機制：失敗氣泡、toast、`alert()`。這次只統一
`alert()` → toast，刻意保留失敗氣泡，原因是**語意不同**：失敗氣泡是 AI 回覆流程的一部分
（取代「思考中」佔位符，是對話串裡的一則訊息），使用者需要在對話脈絡中看到「這則訊息沒有
成功回覆」；toast 是與對話內容無關的側邊操作回饋（刪除、儲存、重啟）。把失敗氣泡也換成
toast 會讓使用者看不到「AI 沒有回覆」這件事在對話流程中的位置，是行為倒退，不是統一。

## 主人公人設彈窗的可及性補強細節

- `role="dialog" aria-modal="true"`：告知輔助科技這是模態內容。
- `aria-labelledby="protagonistModalTitle"`：指向 `<h3>主人公人設</h3>`，讓螢幕報讀器
  在進入彈窗時朗讀標題。
- 開啟時：把焦點移到 `protagonistNameInput`（第一個可互動欄位）。
- 關閉時（✕ 按鈕、點擊遮罩、Escape 皆算）：焦點歸還給觸發彈窗的 `protagonistBtn`。
- 新增 `keydown` 監聽：`Escape` 觸發與 ✕ 按鈕相同的關閉邏輯。

## `session.js` 的邊界

只包裝「讀寫」，不包裝業務邏輯（例如不在 `setToken()` 裡順便驗證 token 格式）——與
`api.js`/`config-loader.js` 一貫的「薄封裝」風格一致，職責單純是「這個狀態存在哪裡、
鍵名是什麼」這件事的單一入口，方便未來若要換儲存位置（如 cookie）只需改這一個檔案。

## `chat.js` 拆分後的行數概估

- `chat.js`：initChat 主流程 + 渲染 + 發送/輪詢 + 刪除 + 重啟，約 400-450 行（原 886 行）
- `api.js`：約 90-110 行（9 個端點 + header 輔助函式）
- `toast.js`：約 20 行
- `messageMenu.js`：約 60-70 行
- `protagonistModal.js`：約 90-110 行
- `session.js`：約 15 行

拆分後每個檔案對應單一職責，符合 B 節「模組邊界與資訊隱藏」——這點與 `virtualMessageList.js`／
`menuPosition.js` 原本就有的模組化風格一致，不是新引入的規範。
