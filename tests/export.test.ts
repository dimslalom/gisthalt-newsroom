import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { verticalStill } from '@newsroom/render/export';

describe('manual TikTok export', () => {
  it.each([[1080, 1350], [1080, 1080], [1080, 1920]])('exports %ix%i artwork as a 1080x1920 PNG', async (width, height) => {
    const source = await sharp({ create: { width, height, channels: 3, background: '#f05020' } }).png().toBuffer();
    const result = await verticalStill(source);
    expect(await sharp(result).metadata()).toMatchObject({ width: 1080, height: 1920, format: 'png' });
    const center = await sharp(result).extract({ left: 540, top: 960, width: 1, height: 1 }).removeAlpha().raw().toBuffer();
    expect([...center]).toEqual([240, 80, 32]);
  });
});
