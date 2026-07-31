// Playwright script: drive persona-nexus-chat through a real browser against the
// real running services (no mocks) to verify chat behavior.
//
// Usage:
//   node pw-chat-test.js <characterId> <token> <messageCount> <label>
//
// Logs every console message and every /api/conversations* network response with
// a wall-clock timestamp, and polls the last bot bubble's text every second so we
// can correlate frontend behavior with backend logs after the fact.

import { chromium } from 'playwright';

const [, , characterId, token, messageCountArg, label] = process.argv;
const messageCount = parseInt(messageCountArg || '1', 10);
const runLabel = label || 'run';

function ts() {
  return new Date().toISOString();
}

function log(...args) {
  console.log(`[${ts()}]`, ...args);
}

async function main() {
  log(`=== START ${runLabel} === characterId=${characterId} messageCount=${messageCount}`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  page.on('console', (msg) => {
    log(`[console.${msg.type()}]`, msg.text());
  });
  page.on('pageerror', (err) => {
    log('[pageerror]', err.message);
  });
  page.on('requestfinished', async (req) => {
    const url = req.url();
    if (url.includes('/api/conversations')) {
      try {
        const res = await req.response();
        log(`[net] ${req.method()} ${url} -> ${res ? res.status() : '?'}`);
      } catch (e) {
        log(`[net-err] ${req.method()} ${url} -> ${e.message}`);
      }
    }
  });

  const url = `http://localhost:8080/chat/?characterId=${characterId}&token=${encodeURIComponent(token)}`;
  log('navigating to', url);
  await page.goto(url, { waitUntil: 'domcontentloaded' });

  log('waiting for #initializingOverlay to hide (conversation ready)...');
  await page.waitForSelector('#initializingOverlay.hidden', { timeout: 130000 }).catch(async () => {
    log('WARN: initializingOverlay never got .hidden within 130s, checking current state anyway');
  });

  await page.waitForSelector('#messageInput:not([disabled])', { timeout: 130000 });
  log('message input ready, conversation is ready');

  for (let i = 0; i < messageCount; i++) {
    const text = `[PW-${runLabel}-${i + 1}] 你好，請簡短回覆確認收到，時間 ${ts()}`;
    log(`--- sending message ${i + 1}/${messageCount} ---`);
    await page.fill('#messageInput', text);

    const sentAt = Date.now();
    await page.click('#sendBtn');
    log(`SENT at ${ts()} (epoch ${sentAt}): ${text}`);

    // Poll the last bot bubble's text every second for up to 130s, logging changes.
    let lastText = null;
    let finalState = 'TIMEOUT_NO_CHANGE';
    const deadline = Date.now() + 130000;
    while (Date.now() < deadline) {
      const currentText = await page.evaluate(() => {
        const bubbles = document.querySelectorAll('#messagesList .message.bot .message-content');
        if (bubbles.length === 0) return null;
        return bubbles[bubbles.length - 1].textContent;
      });
      if (currentText !== lastText) {
        log(`BUBBLE_CHANGE at +${Date.now() - sentAt}ms: "${currentText}"`);
        lastText = currentText;
        if (currentText && currentText.includes('回應失敗')) {
          finalState = 'FAILURE_BUBBLE';
          break;
        }
        if (currentText && !currentText.includes('正在思考中')) {
          finalState = 'SUCCESS_BUBBLE';
          break;
        }
      }
      await page.waitForTimeout(1000);
    }
    log(`RESULT message ${i + 1}: ${finalState} (elapsed ${Date.now() - sentAt}ms), lastText="${lastText}"`);

    // Small gap between messages so bubbles/logs don't interleave confusingly.
    await page.waitForTimeout(2000);
  }

  log('=== reloading page to check persisted state (does DB actually have the AI reply?) ===');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const afterReload = await page.evaluate(() => {
    const bubbles = document.querySelectorAll('#messagesList .message.bot .message-content');
    return Array.from(bubbles).map(b => b.textContent);
  });
  log('AFTER_RELOAD bot bubbles:', JSON.stringify(afterReload));

  await browser.close();
  log(`=== END ${runLabel} ===`);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
