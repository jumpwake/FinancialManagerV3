/**
 * One-off icon generation for the PWA.
 * Run:  npx tsx scripts/generate-icons.ts
 * Reads:  Documentation/bis_cropped2.png (transparent-background BIS globe)
 * Writes: src/report/app/public/icons/icon-{180,192,512,512-maskable}.png
 *
 * Strategy: render background + $ glyph via SVG; resize the globe via sharp;
 * composite the globe over the background. librsvg in sharp doesn't reliably
 * load <image href> file URLs, so we composite explicitly.
 */
import sharp from "sharp";
import path from "node:path";
import fs from "node:fs/promises";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(REPO_ROOT, "Documentation/bis_cropped2.png");
const OUT_DIR = path.join(REPO_ROOT, "src/report/app/public/icons");

// Background + $ glyph (no globe; globe is composited via sharp).
function backgroundSvg(size: number, dollarPct: number): string {
  const dollarSize = Math.round(size * dollarPct);
  const dollarRight = Math.round(size * 0.10);
  const dollarBottom = Math.round(size * 0.10);
  const shadowDy = Math.max(1, Math.round(size * 0.006));
  const shadowBlur = Math.max(1, Math.round(size * 0.012));

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <radialGradient id="bg" cx="45%" cy="42%" r="75%">
      <stop offset="0%" stop-color="#1f3c5a"/>
      <stop offset="100%" stop-color="#111111"/>
    </radialGradient>
    <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="${shadowDy}" stdDeviation="${shadowBlur}" flood-color="#000" flood-opacity="0.6"/>
    </filter>
  </defs>
  <rect width="${size}" height="${size}" fill="url(#bg)"/>
  <text x="${size - dollarRight}" y="${size - dollarBottom}" text-anchor="end" font-family="Georgia, serif" font-weight="700" font-size="${dollarSize}" fill="#b8d62a" filter="url(#shadow)">$</text>
</svg>`;
}

async function renderIcon(size: number, outPath: string, opts: { maskable?: boolean } = {}) {
  // Maskable variants need extra safe-area padding around the content.
  const globePct = opts.maskable ? 0.62 : 0.78;
  const dollarPct = opts.maskable ? 0.18 : 0.24;
  const globeSize = Math.round(size * globePct);
  const globeOff = Math.round((size - globeSize) / 2);

  const backgroundBuffer = await sharp(Buffer.from(backgroundSvg(size, dollarPct))).png().toBuffer();
  const globeBuffer = await sharp(SRC)
    .resize(globeSize, globeSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  await sharp(backgroundBuffer)
    .composite([{ input: globeBuffer, top: globeOff, left: globeOff }])
    .png()
    .toFile(outPath);

  console.log(`wrote ${path.relative(REPO_ROOT, outPath)} (${size}x${size}${opts.maskable ? ", maskable" : ""})`);
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  await renderIcon(180, path.join(OUT_DIR, "icon-180.png"));
  await renderIcon(192, path.join(OUT_DIR, "icon-192.png"));
  await renderIcon(512, path.join(OUT_DIR, "icon-512.png"));
  await renderIcon(512, path.join(OUT_DIR, "icon-512-maskable.png"), { maskable: true });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
