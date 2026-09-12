import { copyFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

/**
 * Every published image, caption, source link and platform post ID stored
 * locally, so a suspended account is a one-day rebuild rather than a total loss.
 */
export function archivePost(args: {
  accountId: string; platform: string; compositionId: string;
  caption: string; imagePaths: string[]; sourceUrl: string | null;
  platformPostId: string | null; publishedAt: Date; root?: string;
}): string {
  const root = resolve(args.root ?? process.env.ARCHIVE_DIR ?? './.data/archive');
  const day = args.publishedAt.toISOString().slice(0, 10);
  const dir = join(root, args.accountId, day, `${args.compositionId}-${args.platform}`);
  mkdirSync(dir, { recursive: true });
  for (const p of args.imagePaths) {
    const source = existsSync(p) ? p : resolve(process.env.RENDER_OUT_DIR ?? './.data/renders', basename(p));
    copyFileSync(source, join(dir, basename(p)));
  }
  writeFileSync(join(dir, 'post.json'), JSON.stringify({
    ...args, imagePaths: args.imagePaths.map((p) => basename(p)), publishedAt: args.publishedAt.toISOString(),
  }, null, 2));
  return dir;
}
