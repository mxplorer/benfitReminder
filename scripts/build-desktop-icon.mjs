#!/usr/bin/env node
// Build `assets/brand/ccb-logo-1024.png` by compositing the Dock-specific
// line-art master onto a silver-metallic squircle background. Re-run after
// changes to `assets/brand/dock-source-1024.png` or the styling constants
// below.
//
// Flow:
//   1. Render a squircle SVG (rounded square, radius matches macOS icon feel)
//      filled with a silver vertical gradient.
//   2. Recolor the black line art from the Dock source to a near-black dark
//      gray so it reads well on the silver background.
//   3. Composite recolored line art on top of the squircle.

import sharp from "sharp";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DOCK_SOURCE = path.join(ROOT, "assets/brand/dock-source-1024.png");
const OUT_PATH = path.join(ROOT, "assets/brand/ccb-logo-1024.png");

const SIZE = 1024;
// Corner radius ~22% of size roughly matches macOS Big Sur+ app icon curvature.
// Not the exact squircle superellipse, but visually reads the same at scale.
const CORNER_RADIUS = 225;
// Target side length for the line-art content after trimming + centering.
// The Dock source's trimmed bbox is ~931×686, so this controls how big
// the glyph renders inside the silver squircle. 820 read as slightly small
// next to other Dock apps, 950 overshot (the width was scaled up past the
// source's natural size). 880 leaves ~72px of safe area per side — content
// fills ~86% of the canvas, matching the visual density of typical Dock icons.
const CONTENT_SIZE = 880;

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

// Near-black dark gray — neutral on silver, no color cast.
const LINE_COLOR = { r: 43, g: 43, b: 43 };

const renderSquircle = async () =>
  sharp(Buffer.from(SQUIRCLE_SVG)).png().toBuffer();

// Trim transparent padding from the source, fit the content into
// `CONTENT_SIZE`×`CONTENT_SIZE` preserving aspect ratio, then recolor the
// opaque pixels to `LINE_COLOR` while keeping alpha. Returns the fitted RGBA
// buffer plus the (top, left) offsets that center it on the SIZE canvas.
const prepareLineArt = async (srcPath, color) => {
  const trimmed = await sharp(srcPath).trim({ threshold: 0 }).toBuffer();
  const meta = await sharp(trimmed).metadata();
  const ratio = Math.min(CONTENT_SIZE / meta.width, CONTENT_SIZE / meta.height);
  const fitW = Math.round(meta.width * ratio);
  const fitH = Math.round(meta.height * ratio);

  const fitted = await sharp(trimmed)
    .resize(fitW, fitH, { kernel: "lanczos3" })
    .png()
    .toBuffer();

  const alpha = await sharp(fitted)
    .ensureAlpha()
    .extractChannel("alpha")
    .toBuffer();

  const colored = await sharp({
    create: { width: fitW, height: fitH, channels: 3, background: color },
  })
    .joinChannel(alpha)
    .png()
    .toBuffer();

  return {
    buffer: colored,
    top: Math.round((SIZE - fitH) / 2),
    left: Math.round((SIZE - fitW) / 2),
  };
};

const squircle = await renderSquircle();
const { buffer: lineArt, top, left } = await prepareLineArt(
  DOCK_SOURCE,
  LINE_COLOR,
);

const final = await sharp(squircle)
  .composite([{ input: lineArt, top, left }])
  .png()
  .toBuffer();

await writeFile(OUT_PATH, final);
console.log(`wrote ${path.relative(ROOT, OUT_PATH)}`);
