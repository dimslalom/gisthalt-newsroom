/** Deterministic test imagery for the fixture library. No stock photos, no network. */
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const dir = resolve('fixtures/images');
mkdirSync(dir, { recursive: true });

const svg = (w, h, body) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${body}</svg>`);

// A normal frame: dark subject, quiet bottom-right corner.
await sharp(svg(1080, 1350, `
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#2b3a45"/><stop offset="1" stop-color="#0b0f12"/></linearGradient></defs>
  <rect width="1080" height="1350" fill="url(#g)"/>
  <circle cx="360" cy="420" r="230" fill="#16212a"/>
  <rect x="0" y="760" width="1080" height="12" fill="#1d2a33"/>`)).png().toFile(`${dir}/normal.png`);

// White sky where white text goes, dark frame where dark text goes.
await sharp(svg(1080, 1350, `
  <rect width="1080" height="1350" fill="#f7f7f5"/>
  <rect y="900" width="1080" height="450" fill="#0d0d0d"/>
  <circle cx="820" cy="260" r="150" fill="#ffffff"/>`)).png().toFile(`${dir}/lowcontrast.png`);

// High detail everywhere: forces pickLogoCorner into its strip fallback.
let busy = '';
for (let i = 0; i < 2600; i++) {
  const x = (i * 97) % 1080, y = (i * 241) % 1350, s = 4 + (i % 17);
  busy += `<rect x="${x}" y="${y}" width="${s}" height="${s}" fill="hsl(${(i * 13) % 360} 60% ${25 + (i % 50)}%)"/>`;
}
await sharp(svg(1080, 1350, `<rect width="1080" height="1350" fill="#3a3a3a"/>${busy}`)).png().toFile(`${dir}/busy.png`);

// Ultra-wide and ultra-tall sources; the crop must still resolve to 4:5.
await sharp(svg(2400, 600, `<rect width="2400" height="600" fill="#123"/><circle cx="1200" cy="300" r="240" fill="#2b6cb0"/>`)).png().toFile(`${dir}/ultrawide.png`);
await sharp(svg(600, 2400, `<rect width="600" height="2400" fill="#231"/><circle cx="300" cy="1200" r="240" fill="#b07f2b"/>`)).png().toFile(`${dir}/ultratall.png`);

// A 120px thumbnail: too small to use as a bed, must fall back to typography.
await sharp(svg(120, 120, `<rect width="120" height="120" fill="#444"/>`)).png().toFile(`${dir}/thumb.png`);

console.log(`wrote fixture images to ${dir}`);
