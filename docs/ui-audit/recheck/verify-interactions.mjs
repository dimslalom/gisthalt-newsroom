import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const base = process.env.DASHBOARD_URL ?? 'http://127.0.0.1:3939';
const browser = await chromium.launch();
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    for (const failure of ['http', 'network']) {
      let fail = true;
      await page.route('**/api/worklist?*', route => fail
        ? failure === 'http' ? route.fulfill({ status: 503, json: { error: 'Renderer unavailable' } }) : route.abort()
        : route.continue());
      await page.goto(`${base}/design`, { waitUntil: 'networkidle' });
      assert.equal(await page.locator('main').getByRole('alert').count(), 1);
      assert.equal(await page.getByText('Loading worklist…', { exact: true }).count(), 0);
      fail = false;
      await page.getByRole('button', { name: 'Retry', exact: true }).click();
      await page.getByRole('link', { name: 'Design', exact: true }).first().waitFor();
      assert.equal(await page.locator('main').getByRole('alert').count(), 0);
      await page.unroute('**/api/worklist?*');
    }
    let job = { running: true, checked: 10, total: 100, done: false };
    await page.route('**/api/goldens/status', route => route.fulfill({ json: job }));
    await page.goto(`${base}/design`, { waitUntil: 'networkidle' });
    await page.getByRole('dialog', { name: 'Certification in progress' }).waitFor();
    for (const key of ['Tab', 'Shift+Tab', 'Escape', 'Tab']) {
      await page.keyboard.press(key);
      assert(await page.evaluate(() => !!document.activeElement.closest('dialog[open]')), `Focus escaped running dialog at ${width}`);
    }
    job = { running: false, checked: 10, total: 100, done: true, error: 'Test certification failure' };
    await page.getByRole('button', { name: 'Close', exact: true }).waitFor();
    for (const key of ['Tab', 'Tab', 'Shift+Tab']) {
      await page.keyboard.press(key);
      assert(await page.evaluate(() => !!document.activeElement.closest('dialog[open]')));
    }
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('dialog').count(), 0);
    await page.unroute('**/api/goldens/status');
    const work = await page.request.get(`${base}/api/worklist?brand=f1`).then(r => r.json());
    const row = work.rows.find(r => r.hasDocument);
    assert(row, 'A saved design is needed for reference verification');
    const editor = `/design/f1/${row.archetype}/${row.layout}`;
    await page.goto(base + editor, { waitUntil: 'networkidle' });
    const launcher = page.getByRole('button', { name: 'Reference render', exact: true });
    await launcher.click();
    await page.getByRole('button', { name: 'Enlarge reference' }).click();
    for (const key of ['Tab', 'Shift+Tab', 'Tab']) {
      await page.keyboard.press(key);
      assert(await page.evaluate(() => !!document.activeElement.closest('dialog[open]')));
    }
    await page.keyboard.press('Escape');
    assert(await launcher.evaluate(el => el === document.activeElement), 'Reference opener did not regain focus');
    await page.close();
    console.log(`PASS ${width}px: HTTP/network retry, certification focus and Escape, reference focus and restoration`);
  }
} finally { await browser.close(); }
