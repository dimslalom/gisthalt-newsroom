import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

export interface DiffResult { match: boolean; diffPixels: number; total: number; ratio: number; diffPath?: string }

/**
 * Golden images catch visual drift; the guards catch data the golden images
 * never contained. You need both.
 */
export function compareToGolden(actualPath: string, goldenPath: string, opts: { threshold?: number; maxRatio?: number; writeDiff?: string } = {}): DiffResult {
  if (!existsSync(goldenPath)) {
    return { match: false, diffPixels: 0, total: 0, ratio: 1 };
  }
  const a = PNG.sync.read(readFileSync(actualPath));
  const b = PNG.sync.read(readFileSync(goldenPath));
  if (a.width !== b.width || a.height !== b.height) {
    return { match: false, diffPixels: a.width * a.height, total: a.width * a.height, ratio: 1 };
  }
  const diff = new PNG({ width: a.width, height: a.height });
  const n = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: opts.threshold ?? 0.1 });
  const total = a.width * a.height;
  const ratio = n / total;
  if (opts.writeDiff && n > 0) {
    mkdirSync(dirname(opts.writeDiff), { recursive: true });
    writeFileSync(opts.writeDiff, PNG.sync.write(diff));
  }
  return { match: ratio <= (opts.maxRatio ?? 0.002), diffPixels: n, total, ratio, diffPath: opts.writeDiff };
}
