# chat-ui (delta) — simplify-chat-ui

## MODIFIED Requirements

### Requirement: 重啟聊天室
系統 SHALL 提供重啟功能：經 `confirm()` 確認後，先 `DELETE /api/conversations/:id`
刪除現有聊天室（含 RAG 資料與主人公人設），成功後重新走聊天室建立輪詢流程
（同「聊天室初始化」需求）。刪除失敗時系統 SHALL 以 `showToast()` 顯示錯誤訊息，
不再使用阻塞式的 `alert()`。

#### Scenario: 重啟成功
- **WHEN** 刪除與重新建立皆成功
- **THEN** `conversationId` 更新為新值，訊息陣列替換為新聊天室的初始訊息，懸浮層撤除

#### Scenario: 刪除失敗
- **WHEN** DELETE 回應非 2xx
- **THEN** 顯示 toast 懸浮通知（含錯誤訊息），撤除初始化懸浮層，不進入建立流程

## ADDED Requirements

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
