#!/usr/bin/env node
// Composite a solid white rounded-rect background + line art + status dot to
// produce 3 states × 2 sizes. Re-run whenever
// `assets/brand/tray-source-1024.png` changes.
//
// The white tile gives the dark line art full contrast against any menu-bar
// wallpaper (vs. a thin halo that can still look muddled on busy backdrops).
// Because the output contains both dark and white pixels, the Rust side must
// NOT use template mode — `icon_as_template(false)`.

import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SOURCE = path.join(ROOT, "assets/brand/tray-source-1024.png");
const OUT_DIR = path.join(ROOT, "src-tauri/icons/tray");

// Dot geometry, expressed relative to icon bounds (per design spec §5):
//   center at (17/22, 17/22), radius 4/22 (diameter 8/22).
const DOT_CENTER_FRAC = 17 / 22;
const DOT_RADIUS_FRAC = 4 / 22;

// White tile corner radius — 15% gives a rounded-rect "app chip" feel that
// matches the desktop squircle at small scale without looking like a plain
// square.
const BG_RADIUS_FRAC = 0.15;

// Line-art content fills this much of the tile's shortest edge. Leaves a
// small white margin inside the rounded rect so strokes don't kiss the edge.
const CONTENT_FRAC = 0.82;

const STATES = [
  { name: "clean", dot: null },
  { name: "unused", dot: "#F5A623" },
  { name: "urgent", dot: "#E53935" },
];

// Apple's menu-bar convention is 22pt, but our bell+card glyph is wider than
// tall (~1.3:1) — at 22px the content reads small and thin on retina. Bumping
// to 44pt logical (44/88 physical) keeps the aspect but fills the menu-bar
// slot more fully. macOS will letterbox vertically as needed.
const SIZES = [
  { suffix: "@1x", px: 44 },
  { suffix: "@2x", px: 88 },
];

const makeWhiteBgSvg = (size) => {
  const r = Math.round(size * BG_RADIUS_FRAC);
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
       <rect x="0" y="0" width="${size}" height="${size}"
             rx="${r}" ry="${r}" fill="#FFFFFF"/>
     </svg>`,
  );
};

const makeDotSvg = (size, color) => {
  if (!color) return null;
  const cx = DOT_CENTER_FRAC * size;
  const cy = DOT_CENTER_FRAC * size;
  const r = DOT_RADIUS_FRAC * size;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
       <circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" />
     </svg>`,
  );
};

// Trim the source to its content bbox, fit it into `contentSize` preserving
// aspect, and return the fitted buffer plus (top, left) offsets to center it
// in a `canvasSize`×`canvasSize` tile.
const prepareLineArt = async (srcPath, canvasSize) => {
  const contentSize = Math.round(canvasSize * CONTENT_FRAC);
  const trimmed = await sharp(srcPath).trim({ threshold: 0 }).toBuffer();
  const meta = await sharp(trimmed).metadata();
  const ratio = Math.min(contentSize / meta.width, contentSize / meta.height);
  const fitW = Math.round(meta.width * ratio);
  const fitH = Math.round(meta.height * ratio);
  const fitted = await sharp(trimmed)
    .resize(fitW, fitH, { kernel: "lanczos3" })
    .png()
    .toBuffer();
  return {
    buffer: fitted,
    top: Math.round((canvasSize - fitH) / 2),
    left: Math.round((canvasSize - fitW) / 2),
  };
};

await mkdir(OUT_DIR, { recursive: true });

for (const { name, dot } of STATES) {
  for (const { suffix, px } of SIZES) {
    const bgSvg = makeWhiteBgSvg(px);
    const { buffer: lineArt, top, left } = await prepareLineArt(SOURCE, px);

    const layers = [{ input: lineArt, top, left }];
    const dotSvg = makeDotSvg(px, dot);
    if (dotSvg) layers.push({ input: dotSvg, top: 0, left: 0 });

    const final = await sharp(bgSvg).composite(layers).png().toBuffer();
    const outPath = path.join(OUT_DIR, `tray-${name}${suffix}.png`);
    await writeFile(outPath, final);
    console.log(`wrote ${path.relative(ROOT, outPath)}`);
  }
}
