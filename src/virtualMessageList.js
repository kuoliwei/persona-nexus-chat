/**
 * virtualMessageList.js — 聊天訊息虛擬滾動模組（vanilla，無相依）
 *
 * 目的：DOM 永遠只保留「可視區 + 前後緩衝」的少量氣泡，
 *       不論聊天室累積幾千條訊息都不會卡。
 *       完整的訊息資料由外部（chat.js 的 messages 陣列）持有，本模組不複製、不刪除資料。
 *
 * 支援聊天場景的三個困難特性：
 *   1. 變動高度：每條氣泡高度不同 → 渲染後實測、以訊息 id 為 key 快取
 *   2. 底部對齊：預設停在最底；使用者在底部時，新訊息自動貼底
 *   3. 往上捲載入舊訊息時畫面不跳動（捲動錨定）
 *
 * 整合方式（之後）：
 *   const vlist = createVirtualMessageList({ scrollEl, listEl, getItems, keyOf, renderItem });
 *   然後把 chat.js 的 renderMessages() 內容改成 vlist.sync();
 *   自動貼底改用 vlist.scrollToBottom();
 *   本模組不主動監聽資料變化——外部改完 messages 陣列後呼叫 sync() 即可（沿用原契約）。
 */

export function createVirtualMessageList({
  scrollEl,                    // 捲動容器（.messages-container，overflow-y: auto）
  listEl,                      // 內層列表（.messages-list）
  getItems,                    // () => Array，回傳完整訊息陣列（外部 source of truth）
  keyOf,                       // (item) => string，穩定唯一 key（訊息 id）
  renderItem,                  // (item) => string，單條氣泡的 HTML
  estimatedItemHeight = 80,    // 尚未實測項的估算高度（px）
  gap = 12,                    // 氣泡間距（對應原 CSS 的 gap: 12px）
  overscan = 6,                // 可視區前後各多渲染幾條當緩衝
  nearBottomThreshold = 80,    // 距底多少 px 內視為「使用者正在底部」
}) {
  // ===== 內部狀態 =====
  const heights = new Map();   // key -> 實測高度（純氣泡高度，不含 gap）
  const renderedEls = new Map(); // 🆕 key -> 目前在 DOM 中的氣泡元素（供跨幀複用，避免整窗重建）
  let scheduled = false;       // rAF 節流旗標
  let lastRange = { start: -1, end: -1 };  // 上次渲染的區間（避免無變化重繪）
  const buildWrap = document.createElement('div');  // 建立新氣泡時的暫存容器

  // 上下撐條：用明確像素高度佔位，代表「未渲染的訊息」佔的空間
  const topSpacer = document.createElement('div');
  topSpacer.className = 'vlist-spacer-top';
  const bottomSpacer = document.createElement('div');
  bottomSpacer.className = 'vlist-spacer-bottom';

  // 接管列表佈局：改 block（消除 flex gap 對高度計算的干擾），間距改由每項 margin-bottom 負責
  listEl.style.display = 'block';
  listEl.style.gap = '0';
  // 撐條常駐 listEl，氣泡在兩者之間增刪（複用式協調）
  listEl.replaceChildren(topSpacer, bottomSpacer);

  // ===== 高度計算輔助 =====
  // 單項「佔位高度」= 實測高度（或估算）+ 間距
  function slotHeight(key) {
    return (heights.get(key) ?? estimatedItemHeight) + gap;
  }

  // 全部訊息的總捲動高度
  function totalHeight(items) {
    let sum = 0;
    for (const item of items) sum += slotHeight(keyOf(item));
    return sum;
  }

  // 根據目前捲動位置，算出應該渲染的訊息區間
  function computeRange(items) {
    const scrollTop = scrollEl.scrollTop;
    const viewportH = scrollEl.clientHeight;

    let offset = 0;          // 累積到目前 index 頂端的像素位置
    let start = 0;
    let startOffset = 0;     // start 項頂端的像素位置

    // 找第一個「底端超過捲動頂線」的項
    let i = 0;
    for (; i < items.length; i++) {
      const h = slotHeight(keyOf(items[i]));
      if (offset + h > scrollTop) {
        start = i;
        startOffset = offset;
        break;
      }
      offset += h;
    }
    if (i === items.length) {
      // 全部都在捲動位置上方（極端情況）→ 顯示最後一批
      start = Math.max(0, items.length - 1);
      startOffset = offset - slotHeight(keyOf(items[start]));
    }

    // 從 start 往下累積，找超過視窗底線的項當 end
    let end = start;
    let acc = 0;
    for (let j = start; j < items.length; j++) {
      acc += slotHeight(keyOf(items[j]));
      end = j;
      if (startOffset + acc >= scrollTop + viewportH) break;
    }

    // 套上 overscan 緩衝
    start = Math.max(0, start - overscan);
    end = Math.min(items.length - 1, end + overscan);

    // 重新計算 start 項的頂端偏移（因 overscan 調整過）
    let offsetTop = 0;
    for (let k = 0; k < start; k++) offsetTop += slotHeight(keyOf(items[k]));

    return { start, end, offsetTop };
  }

  // ===== 渲染（複用式協調：只增刪進出視窗的節點，重疊部分原封不動，避免整窗重建的閃爍）=====
  function renderWindow(items, range, forceRebuild = false) {
    const { start, end, offsetTop } = range;

    // 區間沒變就不重繪（純捲動微動時省成本）
    if (!forceRebuild && start === lastRange.start && end === lastRange.end) {
      return;
    }
    lastRange = { start, end };

    // 1. 算出這次視窗需要的 key（依序）
    const desiredKeys = [];
    for (let i = start; i <= end; i++) desiredKeys.push(keyOf(items[i]));
    const desiredSet = new Set(desiredKeys);

    // 2. 移除已離開視窗的節點（不再需要的才動，重疊的留著）
    for (const [key, el] of renderedEls) {
      if (!desiredSet.has(key)) {
        el.remove();
        renderedEls.delete(key);
      }
    }

    // 3. 上撐條 = start 之前所有訊息佔的高度
    topSpacer.style.height = `${offsetTop}px`;

    // 4. 依序確保每個氣泡存在且位置正確（複用既有、只建立新進來的）
    let prevNode = topSpacer;
    let windowHeight = 0;
    for (let i = start; i <= end; i++) {
      const item = items[i];
      const key = keyOf(item);
      let el = renderedEls.get(key);
      if (!el) {
        // 新進視窗 → 建立節點
        buildWrap.innerHTML = renderItem(item);
        el = buildWrap.firstElementChild;
        if (!el) continue;
        el.dataset.vkey = key;
        el.style.marginBottom = `${gap}px`;  // 間距改由每項自帶（取代 flex gap）
        renderedEls.set(key, el);
      }
      // 確保 el 緊接在 prevNode 之後（順序正確；已在正確位置就不動）
      if (prevNode.nextSibling !== el) {
        listEl.insertBefore(el, prevNode.nextSibling);
      }
      prevNode = el;
      windowHeight += slotHeight(key);
    }

    // 5. 下撐條移到最後一個氣泡之後，高度 = end 之後所有訊息佔的高度
    if (prevNode.nextSibling !== bottomSpacer) {
      listEl.insertBefore(bottomSpacer, prevNode.nextSibling);
    }
    const total = totalHeight(items);
    bottomSpacer.style.height = `${Math.max(0, total - offsetTop - windowHeight)}px`;

    // 6. 渲染後實測真實高度、更新快取（下一輪計算就精準了）
    measureRendered(items);
  }

  // 實測目前 DOM 中的氣泡高度，寫回快取；若上方項高度有修正，補償捲動位置避免跳動
  function measureRendered(items) {
    let corrected = false;
    let deltaAboveViewport = 0;
    const scrollTop = scrollEl.scrollTop;

    const els = listEl.querySelectorAll('.message[data-vkey]');
    let runningOffset = parseFloat(topSpacer.style.height) || 0;
    els.forEach((el) => {
      const key = el.dataset.vkey;
      const measured = el.getBoundingClientRect().height;
      const prev = heights.get(key);
      if (prev === undefined || Math.abs(prev - measured) > 0.5) {
        // 若這一項整個在視窗上方，其高度修正會把下面的內容往下推 → 需補償捲動
        if (runningOffset + measured < scrollTop) {
          deltaAboveViewport += measured - (prev ?? estimatedItemHeight);
        }
        heights.set(key, measured);
        corrected = true;
      }
      runningOffset += measured + gap;
    });

    if (corrected) {
      // 高度有更新 → 修正下撐條讓總高正確
      const total = totalHeight(items);
      const offsetTop = parseFloat(topSpacer.style.height) || 0;
      let windowHeight = 0;
      listEl.querySelectorAll('.message[data-vkey]').forEach((el) => {
        windowHeight += (heights.get(el.dataset.vkey) ?? estimatedItemHeight) + gap;
      });
      bottomSpacer.style.height = `${Math.max(0, total - offsetTop - windowHeight)}px`;

      // 補償上方項的高度誤差，避免使用者眼前的內容跳動
      if (deltaAboveViewport !== 0) {
        scrollEl.scrollTop = scrollTop + deltaAboveViewport;
      }
    }
  }

  // ===== 捲動處理（rAF 節流）=====
  function onScroll() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      const items = getItems();
      renderWindow(items, computeRange(items));
    });
  }

  // ===== 對外 API =====

  // 判斷使用者目前是否貼在底部
  function isNearBottom() {
    return scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight <= nearBottomThreshold;
  }

  // 資料變動後呼叫：重新評估可視區並渲染。若呼叫前使用者在底部，渲染後自動貼底。
  function sync() {
    const stick = isNearBottom();
    const items = getItems();
    renderWindow(items, computeRange(items), true);
    if (stick) scrollToBottom();
  }

  // 捲到最底（顯示最新訊息）。跨兩幀確保實測後仍精準貼底。
  function scrollToBottom() {
    const items = getItems();
    // 先直接把捲動位置設到目前總高的底部
    scrollEl.scrollTop = totalHeight(items);
    renderWindow(items, computeRange(items), true);
    // 實測後總高可能微調，再貼一次
    requestAnimationFrame(() => {
      scrollEl.scrollTop = totalHeight(getItems());
    });
  }

  // 卸載（清理事件監聽）
  function destroy() {
    scrollEl.removeEventListener('scroll', onScroll);
  }

  // 初始化：綁定捲動監聽，做第一次渲染
  scrollEl.addEventListener('scroll', onScroll, { passive: true });
  sync();

  return { sync, scrollToBottom, isNearBottom, destroy };
}
