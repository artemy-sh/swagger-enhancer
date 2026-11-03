const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

// Toolbar popups are separate CDP targets, not ordinary Playwright tabs.
async function attachPopup(cdp, targetId) {
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: false });
  const pending = new Map();
  let id = 0;
  const receive = event => {
    if (event.sessionId !== sessionId) return;
    const message = JSON.parse(event.message);
    const job = pending.get(message.id);
    if (!job) return;
    pending.delete(message.id);
    message.error ? job.reject(new Error(message.error.message)) : job.resolve(message.result);
  };
  cdp.on('Target.receivedMessageFromTarget', receive);
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const key = ++id;
    pending.set(key, { resolve, reject });
    cdp.send('Target.sendMessageToTarget', {
      sessionId, message: JSON.stringify({ id: key, method, params })
    }).catch(reject);
  });
  return {
    send,
    async evaluate(expression) {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
      return result.result.value;
    },
    async close() {
      cdp.off('Target.receivedMessageFromTarget', receive);
      await cdp.send('Target.closeTarget', { targetId });
    }
  };
}

test('real toolbar popup autosizes without compressed switches or clipped support actions', { timeout: 60000 }, async t => {
  const root = path.resolve(__dirname, '../..');
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium', headless: true,
    ...(process.env.SWAGGER_TEST_CHROMIUM ? { executablePath: process.env.SWAGGER_TEST_CHROMIUM } : {}),
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`]
  });
  t.after(() => context.close());
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  await expect.poll(() => worker.evaluate(() => chrome.storage.sync.get('darkThemeEnabled'))).toEqual({ darkThemeEnabled: false });
  await context.pages()[0].goto('about:blank');
  const cdp = await context.browser().newBrowserCDPSession();

  for (const dark of [false, true]) {
    await worker.evaluate(value => chrome.storage.sync.set({ darkThemeEnabled: value }), dark);
    await worker.evaluate(() => chrome.action.openPopup());
    let target;
    await expect.poll(async () => {
      target = (await cdp.send('Target.getTargets')).targetInfos.find(info => info.url.endsWith('/popup.html'));
      return !!target;
    }).toBe(true);
    const popup = await attachPopup(cdp, target.targetId);
    await expect.poll(() => popup.evaluate(`document.querySelectorAll('.switch input:not(:disabled)').length`)).toBe(9);
    assert.equal(await popup.evaluate(`[...document.querySelectorAll('.switch input')].every(input => [...input.labels].some(label => label.textContent.trim()))`), true, 'Every switch has a descriptive label');
    await expect.poll(() => popup.evaluate(`
      [...document.querySelectorAll('.switch input:checked')].every(input =>
        getComputedStyle(input.nextElementSibling).backgroundColor === 'rgb(73, 204, 144)')
    `)).toBe(true);
    const metrics = await popup.evaluate(`(() => {
      const root = document.documentElement;
      return {
        width: innerWidth, height: innerHeight, scrollWidth: root.scrollWidth, scrollHeight: root.scrollHeight,
        dark: document.getElementById('container').classList.contains('dark'),
        footerBottom: document.querySelector('.swagger-support-issue').getBoundingClientRect().bottom,
        mascot: (() => {
          const rect = document.querySelector('.swagger-support-mascot').getBoundingClientRect();
          const heading = document.querySelector('.swagger-support-heading').getBoundingClientRect();
          return { width: rect.width, height: rect.height, centerOffset: Math.abs(rect.top + rect.height / 2 - heading.top - heading.height / 2) };
        })(),
        rows: [...document.querySelectorAll('.toggle-container')].map(row => {
          const label = row.querySelector('.toggle-label').getBoundingClientRect();
          const toggle = row.querySelector('.switch').getBoundingClientRect();
          return { width: toggle.width, labelHeight: label.height, gap: toggle.left - label.right };
        })
      };
    })()`);
    assert.equal(metrics.width, 320, 'the browser must measure a stable intrinsic width');
    assert.equal(metrics.dark, dark);
    assert.equal(metrics.scrollWidth, 320, 'no horizontal overflow');
    assert.ok(metrics.scrollHeight <= metrics.height, JSON.stringify(metrics));
    assert.ok(metrics.footerBottom <= metrics.height, 'the sharing and support actions remain visible');
    assert.equal(metrics.mascot.width, 40);
    assert.equal(metrics.mascot.height, 40);
    assert.ok(metrics.mascot.centerOffset <= 1, 'the cat stays square and centered beside the popup heading');
    assert.ok(metrics.rows.every(row => row.width === 46 && row.labelHeight <= 18 && row.gap >= 12), JSON.stringify(metrics.rows));
    if (process.env.SWAGGER_TEST_SCREENSHOTS) {
      fs.mkdirSync(process.env.SWAGGER_TEST_SCREENSHOTS, { recursive: true });
      const shot = await popup.send('Page.captureScreenshot');
      fs.writeFileSync(path.join(process.env.SWAGGER_TEST_SCREENSHOTS, `native-popup-${dark ? 'dark' : 'light'}.png`), Buffer.from(shot.data, 'base64'));
    }
    await expect.poll(() => popup.evaluate(`!document.getElementById('swagger-site-input').disabled`)).toBe(true);
    await popup.evaluate(`document.getElementById('swagger-site-settings').open = true`);
    await expect.poll(() => popup.evaluate(`document.getElementById('swagger-site-input').getBoundingClientRect().width`)).toBeGreaterThan(200);
    await popup.evaluate(`document.getElementById('swagger-site-save').scrollIntoView({ block: 'nearest' })`);
    const editor = await popup.evaluate(`(() => {
      const button = document.getElementById('swagger-site-save').getBoundingClientRect();
      return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, saveTop: button.top, saveBottom: button.bottom, height: innerHeight };
    })()`);
    assert.equal(editor.scrollWidth, editor.width, 'expanded settings do not overflow horizontally');
    assert.ok(editor.saveTop >= 0 && editor.saveBottom <= editor.height, 'the Save sites action remains reachable in the real toolbar popup');
    if (process.env.SWAGGER_TEST_SCREENSHOTS) {
      const shot = await popup.send('Page.captureScreenshot');
      fs.writeFileSync(path.join(process.env.SWAGGER_TEST_SCREENSHOTS, `native-sites-${dark ? 'dark' : 'light'}.png`), Buffer.from(shot.data, 'base64'));
    }
    await popup.close();
  }
});
