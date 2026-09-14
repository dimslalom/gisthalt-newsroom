import { chromium, type BrowserContext, type Page } from 'playwright';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { validateCaption, type Platform, type PublishAdapter, type PublishRequest, type PublishResult, type SessionHealth } from '@newsroom/core';
import { verticalStill } from '@newsroom/render/export';

const HOME: Record<Platform, string> = { x: 'https://x.com/home', instagram: 'https://www.instagram.com/', threads: 'https://www.threads.com/', tiktok: 'https://www.tiktok.com/tiktokstudio/upload' };
const contexts = new Map<string, Promise<BrowserContext>>();

export class SocialBrowserAdapter implements PublishAdapter {
  readonly platform: Platform;
  constructor(platform: Platform) { this.platform = platform; }
  private async context(accountId: string) {
    if (!/^[a-zA-Z0-9_-]+$/.test(accountId)) throw new Error('invalid account id');
    const dir = resolve(process.env.AGENT_PROFILE_ROOT ?? './.data/profiles', accountId);
    if (!contexts.has(dir)) contexts.set(dir, chromium.launchPersistentContext(dir, { channel: 'chrome', headless: false, viewport: null }).catch((e) => { contexts.delete(dir); throw e; }));
    return contexts.get(dir)!;
  }
  async checkSession(accountId: string): Promise<SessionHealth> {
    let page: Page | undefined;
    const checkedAt = new Date();
    try {
      const ctx = await this.context(accountId); page = ctx.pages()[0] ?? await ctx.newPage();
      await page.goto(HOME[this.platform], { waitUntil: 'domcontentloaded', timeout: 30000 });
      const selector = this.platform === 'x' ? '[data-testid="SideNav_NewTweet_Button"]' : this.platform === 'instagram' ? 'svg[aria-label="New post"]' : this.platform === 'threads' ? 'svg[aria-label="Create"]' : 'input[type="file"]';
      await page.locator(selector).first().waitFor({ state: this.platform === 'tiktok' ? 'attached' : 'visible', timeout: 15000 });
      return { accountId, checkedAt, healthy: true };
    } catch (e) {
      const path = resolve(process.env.AGENT_PROFILE_ROOT ?? './.data/profiles', accountId, 'session-failure.png');
      await page?.screenshot({ path }).catch(() => {});
      return { accountId, checkedAt, healthy: false, screenshotPath: path, detail: (e as Error).message };
    }
  }
  async publish(req: PublishRequest): Promise<PublishResult> {
    const start = Date.now();
    const receipts = resolve(process.env.PUBLISH_RECEIPT_DIR ?? './.data/receipts');
    mkdirSync(receipts, { recursive: true });
    const receipt = resolve(receipts, `${createHash('sha256').update(req.idempotencyKey).digest('hex')}.json`);
    if (existsSync(receipt)) {
      const previous = JSON.parse(readFileSync(receipt, 'utf8'));
      return previous.result ?? { ok: false, uncertain: true, error: 'previous attempt requires manual reconciliation', latencyMs: 0 };
    }
    let submitted = false;
    let page: Page | undefined;
    try {
      validateCaption(req.caption, req.platform);
      if (process.env.PUBLISH_KILL_SWITCH === 'true') throw new Error('publishing disabled');
      const paths = req.imagePaths.map((p) => {
        const file = existsSync(p) ? p : resolve(process.env.RENDER_OUT_DIR ?? './.data/renders', basename(p));
        if (!existsSync(file)) throw new Error(`render not found: ${basename(p)}`);
        return file;
      });
      if (!paths.length || paths.length > (this.platform === 'x' ? 4 : 10)) throw new Error('invalid media count');
      const ctx = await this.context(req.accountId); page = ctx.pages()[0] ?? await ctx.newPage();
      page.setDefaultTimeout(30000);
      await page.goto(this.platform === 'x' ? 'https://x.com/compose/post' : HOME[this.platform], { waitUntil: 'domcontentloaded' });
      let submit: ReturnType<Page['locator']>;
      if (this.platform === 'x') {
        await page.locator('[data-testid="tweetTextarea_0"]').fill(req.caption);
        await page.locator('input[data-testid="fileInput"]').setInputFiles(paths);
        await page.locator('[data-testid="attachments"]').waitFor();
        submit = page.locator('[data-testid="tweetButton"]');
      } else if (this.platform === 'instagram') {
        await page.locator('svg[aria-label="New post"]').click();
        const post = page.getByText('Post', { exact: true });
        if (await post.count()) await post.first().click();
        await page.locator('input[type="file"]').first().setInputFiles(paths);
        // Preserve the renderer's 4:5 ratio across the sequence.
        const crop = page.getByRole('button', { name: /select crop/i });
        if (await crop.count()) { await crop.click(); await page.getByText('4:5', { exact: true }).click(); }
        await page.getByRole('button', { name: 'Next', exact: true }).click();
        await page.getByRole('button', { name: 'Next', exact: true }).click();
        await page.locator('[aria-label="Write a caption..."]').fill(req.caption);
        submit = page.getByRole('button', { name: 'Share', exact: true });
      } else if (this.platform === 'threads') {
        await page.locator('svg[aria-label="Create"]').click();
        await page.locator('[role="textbox"][contenteditable="true"]').first().fill(req.caption);
        await page.locator('input[type="file"]').first().setInputFiles(paths);
        submit = page.getByRole('button', { name: 'Post', exact: true }).last();
      } else {
        // TikTok's web Studio supports native photo-mode posts (up to 35 images) —
        // no video re-encode needed. Still upload each slide as its own 9:16 still,
        // since the platform's feed and algorithm both expect a full vertical frame.
        const stills = await tiktokStills(paths, req.idempotencyKey);
        const photoTab = page.getByText('Photo', { exact: true });
        if (await photoTab.count()) await photoTab.first().click();
        await page.locator('input[type="file"]').first().setInputFiles(stills);
        await page.locator('[contenteditable="true"]').first().fill(req.caption);
        submit = page.getByRole('button', { name: 'Post', exact: true });
      }
      await submit.waitFor({ state: 'visible' });
      // The durable receipt precedes the irreversible click. A timeout after this
      // point is unknown, not a safe-to-retry failure.
      writeFileSync(receipt, JSON.stringify({ startedAt: new Date().toISOString(), platform: this.platform, idempotencyKey: req.idempotencyKey }));
      submitted = true;
      await submit.click();
      if (this.platform === 'x') await page.getByText(/Your post was sent/i).waitFor({ timeout: 60000 });
      else if (this.platform === 'instagram') await page.getByText(/Your post has been shared/i).waitFor({ timeout: 60000 });
      else if (this.platform === 'threads') await page.getByText(/Posted|Your thread was posted/i).first().waitFor({ timeout: 60000 });
      else await page.getByText(/Your photos? (is|are) being uploaded|has been uploaded|Manage your posts/i).first().waitFor({ timeout: 60000 });
      const selector = this.platform === 'x' ? 'a[href*="/status/"]' : this.platform === 'instagram' ? 'a[href*="/p/"]' : this.platform === 'threads' ? 'a[href*="/post/"]' : 'a[href*="/photo/"]';
      const href = await page.locator('[role="alert"], [data-testid="toast"]').locator(selector).first().getAttribute('href', { timeout: 2000 }).catch(() => null);
      const result: PublishResult = { ok: true, url: href ? new URL(href, HOME[this.platform]).href : undefined, platformPostId: href ?? undefined, latencyMs: Date.now() - start };
      writeFileSync(receipt, JSON.stringify({ result }));
      return result;
    } catch (e) {
      const error = (e as Error).message;
      const shot = resolve(receipts, `${createHash('sha256').update(req.idempotencyKey).digest('hex')}.png`);
      await page?.screenshot({ path: shot }).catch(() => {});
      return { ok: false, uncertain: submitted, error, latencyMs: Date.now() - start };
    }
  }
}
/** TikTok photo-mode stills: each 4:5 render re-framed to 9:16 by the same
 *  converter the dashboard's manual export uses (see @newsroom/render/export). */
export async function tiktokStills(images: string[], key: string): Promise<string[]> {
  const dir = resolve(process.env.TIKTOK_OUT_DIR ?? './.data/tiktok'); mkdirSync(dir, { recursive: true });
  const out: string[] = [];
  for (const image of images) {
    const file = resolve(dir, `${createHash('sha256').update(`${key}:${image}`).digest('hex')}.png`);
    writeFileSync(file, await verticalStill(image));
    out.push(file);
  }
  return out;
}
export async function closePublishers() { for (const ctx of contexts.values()) await (await ctx).close(); contexts.clear(); }
