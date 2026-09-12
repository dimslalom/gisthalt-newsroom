import { chromium, type Browser, type Page } from 'playwright';

/** A warm browser with bounded disposable pages. Closing each page's context
 * releases embedded font/image data; long fixture batches must not retain it. */
export class PagePool {
  private browser: Browser | null = null;
  private launching: Promise<Browser> | null = null;
  private readonly waiting: (() => void)[] = [];
  private created = 0;
  private readonly size: number;
  constructor(size = 3) { this.size = Number.isInteger(size) && size > 0 ? size : 3; }
  private async ensureBrowser(): Promise<Browser> {
    if (!this.launching) this.launching = chromium.launch({ args: ['--font-render-hinting=none', '--disable-lcd-text', '--force-color-profile=srgb'] })
      .then((browser) => { this.browser = browser; browser.once('disconnected', () => { this.browser = null; this.launching = null; }); return browser; })
      .catch((e) => { this.launching = null; throw e; });
    return this.launching;
  }
  async acquire(): Promise<Page> {
    if (this.created >= this.size) await new Promise<void>((resolve) => this.waiting.push(resolve));
    else this.created++;
    try { const browser = await this.ensureBrowser(); return await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 }); }
    catch (e) { this.freeSlot(); throw e; }
  }
  private freeSlot() { const next = this.waiting.shift(); if (next) next(); else this.created--; }
  async release(page: Page): Promise<void> {
    await page.close().catch(() => {});
    this.freeSlot();
  }
  async close(): Promise<void> {
    await this.browser?.close().catch(() => {});
    this.browser = null; this.launching = null; this.created = 0;
  }
}
let shared: PagePool | null = null;
export const getPool = (): PagePool => (shared ??= new PagePool(Number(process.env.RENDER_POOL_SIZE ?? 3)));
export const closePool = async (): Promise<void> => { await shared?.close(); shared = null; };
