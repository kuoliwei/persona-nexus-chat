// 依可用空間定位彈出選單，避免飛出畫面（桌機縮窄視窗、手機窄螢幕都適用）。
//
// 用法：選單先以 position:fixed 掛上 DOM，再呼叫本函式。
// 為了量得到選單實際尺寸，呼叫前建議先設 visibility:hidden，定位完再還原。
//
// anchor：觸發選單的按鈕元素（選單會貼齊它）。
export function positionMenu(menu, anchor) {
  const gap = 4;
  const margin = 8; // 與畫面邊緣至少留的間距
  const rect = anchor.getBoundingClientRect();
  const menuW = menu.offsetWidth;
  const menuH = menu.offsetHeight;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // 水平：預設讓選單右緣對齊按鈕右緣（選單往左展開），
  // 若因此超出左邊界，就改成靠左邊界；也不讓它超出右邊界。
  let left = rect.right - menuW;
  if (left < margin) left = margin;
  if (left + menuW > vw - margin) left = vw - margin - menuW;

  // 垂直：預設在按鈕下方；若下方放不下，改放上方。
  let top = rect.bottom + gap;
  if (top + menuH > vh - margin) {
    const above = rect.top - gap - menuH;
    top = above >= margin ? above : Math.max(margin, vh - margin - menuH);
  }

  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}
