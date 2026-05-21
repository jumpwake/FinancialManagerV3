/**
 * One-off icon generation for the PWA.
 * Run:  npx tsx scripts/generate-icons.ts
 * Reads:  Documentation/bis_cropped2.png (transparent-background BIS globe)
 * Writes: src/report/app/public/icons/icon-{180,192,512,512-maskable}.png
 */
import sharp from "sharp";
import path from "node:path";
import fs from "node:fs/promises";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(REPO_ROOT, "Documentation/bis_cropped2.png");
const OUT_DIR = path.join(REPO_ROOT, "src/report/app/public/icons");

// Icon design (locked in spec):
//   - radial gradient background centered at 45% / 42%: #1f3c5a -> #111 at 75% radius
//   - globe inset at ~78% of icon size, centered
//   - floating "$" glyph (Georgia bold, color #b8d62a) at the bottom-right corner with subtle shadow
function svgTemplate(size: number, globePct: number, dollarPct: number): string {
  const globeSize = Math.round(size * globePct);
  const globeOff = Math.round((size - globeSize) / 2);
  const dollarSize = Math.round(size * dollarPct);
  const dollarRight = Math.round(size * 0.10);
  const dollarBottom = Math.round(size * 0.10);

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <radialGradient id="bg" cx="45%" cy="42%" r="75%">
      <stop offset="0%" stop-color="#1f3c5a"/>
      <stop offset="100%" stop-color="#111111"/>
    </radialGradient>
    <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="${Math.max(1, Math.round(size * 0.006))}" stdDeviation="${Math.max(1, Math.round(size * 0.012))}" flood-color="#000" flood-opacity="0.6"/>
    </filter>
  </defs>
  <rect width="${size}" height="${size}" fill="url(#bg)"/>
  <image href="${SRC.replace(/\\/g, "/")}" x="${globeOff}" y="${globeOff}" width="${globeSize}" height="${globeSize}" preserveAspectRatio="xMidYMid meet"/>
  <text x="${size - dollarRight}" y="${size - dollarBottom}" text-anchor="end" font-family="Georgia, serif" font-weight="700" font-size="${dollarSize}" fill="#b8d62a" filter="url(#shadow)">$</text>
</svg>`;
}

async function renderIcon(size: number, outPath: string, opts: { maskable?: boolean } = {}) {
  // Maskable variants need extra safe-area padding around the content.
  const globePct = opts.maskable ? 0.62 : 0.78;
  const dollarPct = opts.maskable ? 0.18 : 0.24;
  const svg = svgTemplate(size, globePct, dollarPct);
  await sharp(Buffer.from(svg)).png().toFile(outPath);
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
