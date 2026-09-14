import sharp from 'sharp';

const VERTICAL_W = 1080;
const VERTICAL_H = 1920;

/**
 * TikTok is 9:16, not 4:5, and takes still images directly in photo mode.
 * Extends a 4:5 render to 1080x1920 by centering the untouched artwork over a
 * blurred, darkened, cover-cropped copy of itself — never stretched, and
 * never a dead black letterbox bar. Shared by the publisher and the
 * dashboard's manual export so both hand TikTok the identical frame.
 */
export async function verticalStill(image: string | Buffer): Promise<Buffer> {
  const source = sharp(image);
  const background = await source.clone()
    .resize(VERTICAL_W, VERTICAL_H, { fit: 'cover' })
    .blur(24)
    .modulate({ brightness: 0.82 })
    .png()
    .toBuffer();
  const foreground = await source.clone()
    .resize(VERTICAL_W, VERTICAL_H, { fit: 'inside' })
    .png()
    .toBuffer();
  const fg = await sharp(foreground).metadata();
  return sharp(background)
    .composite([{
      input: foreground,
      left: Math.round((VERTICAL_W - (fg.width ?? VERTICAL_W)) / 2),
      top: Math.round((VERTICAL_H - (fg.height ?? VERTICAL_H)) / 2),
    }])
    .png()
    .toBuffer();
}
