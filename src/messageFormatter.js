/**
 * messageFormatter.js — 訊息文本的純轉換工具（無 DOM 狀態、無外部依賴）
 */

// HTML 逃逸（防止 XSS）
export function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 訊息文本格式化：括弧內的敘事描寫 → 斜體淡色（並移除括弧本身）
// 先逃逸再轉換，支援全形（）與半形 ( ) 括弧
export function formatMessageText(text) {
  const escaped = escapeHtml(text);
  return escaped
    .replace(/（([^（）]*)）/g, '<span class="narrative">$1</span>')
    .replace(/\(([^()]*)\)/g, '<span class="narrative">$1</span>');
}
