#!/usr/bin/env node
// Build `assets/brand/ccb-logo-1024.png` by compositing the line-art master
// onto a silver-metallic squircle background. Re-run after changes to
// `assets/brand/tray-source-1024.png` or the styling constants below.
//
// Flow:
//   1. Render a squircle SVG (rounded square, radius matches macOS icon feel)
//      filled with a silver vertical gradient.
//   2. Recolor the black line art from the tray source to a dark navy so it
//      reads well on the silver background.
//   3. Composite recolored line art on top of the squircle.

import sharp from "sharp";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TRAY_SOURCE = path.join(ROOT, "assets/brand/tray-source-1024.png");
const OUT_PATH = path.join(ROOT, "assets/brand/ccb-logo-1024.png");

const SIZE = 1024;
// Corner radius ~22% of size roughly matches macOS Big Sur+ app icon curvature.
// Not the exact squircle superellipse, but visually reads the same at scale.
const CORNER_RADIUS = 225;

// Silver gradient stops — light top, darker bottom, subtle band of shine.
const SQUIRCLE_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
  <defs>
    <linearGradient id="silver" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0"    stop-color="#F5F5F7"/>
      <stop offset="0.45" stop-color="#D5D7DA"/>
      <stop offset="0.55" stop-color="#CACCCF"/>
      <stop offset="1"    stop-color="#A8AAAE"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${SIZE}" height="${SIZE}"
        rx="${CORNER_RADIUS}" ry="${CORNER_RADIUS}"
        fill="url(#silver)"/>
</svg>`;

// Dark navy — contrasts well on silver, feels modern without going pure black.
const LINE_COLOR = { r: 31, g: 58, b: 95 };

const renderSquircle = async () =>
  sharp(Buffer.from(SQUIRCLE_SVG)).png().toBuffer();

// Take a transparent-bg mono line-art PNG and recolor its opaque pixels to
// `LINE_COLOR`, preserving the original alpha.
const recolorLineArt = async (srcPath, color) => {
  const alpha = await sharp(srcPath)
    .ensureAlpha()
    .extractChannel("alpha")
    .toBuffer();
  return sharp({
    create: {
      width: SIZE,
      height: SIZE,
      channels: 3,
      background: color,
    },
  })
    .joinChannel(alpha)
    .png()
    .toBuffer();
};

const squircle = await renderSquircle();
const lineArt = await recolorLineArt(TRAY_SOURCE, LINE_COLOR);

const final = await sharp(squircle)
  .composite([{ input: lineArt, top: 0, left: 0 }])
  .png()
  .toBuffer();

await writeFile(OUT_PATH, final);
console.log(`wrote ${path.relative(ROOT, OUT_PATH)}`);
