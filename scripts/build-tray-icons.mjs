#!/usr/bin/env node
// Composite the status dot onto the line-art source to produce 3 states × 2 sizes.
// Re-run this whenever `assets/brand/tray-source-1024.png` changes.

import sharp from "sharp";
import { mkdir } from "node:fs/promises";
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

const STATES = [
  { name: "clean", dot: null },
  { name: "unused", dot: "#F5A623" },
  { name: "urgent", dot: "#E53935" },
];

const SIZES = [
  { suffix: "@1x", px: 22 },
  { suffix: "@2x", px: 44 },
];

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

await mkdir(OUT_DIR, { recursive: true });

for (const { name, dot } of STATES) {
  for (const { suffix, px } of SIZES) {
    const base = sharp(SOURCE).resize(px, px, { kernel: "lanczos3" });
    const svg = makeDotSvg(px, dot);
    const pipeline = svg
      ? base.composite([{ input: svg, top: 0, left: 0 }])
      : base;
    const outPath = path.join(OUT_DIR, `tray-${name}${suffix}.png`);
    await pipeline.png().toFile(outPath);
    console.log(`wrote ${path.relative(ROOT, outPath)}`);
  }
}
