#!/usr/bin/env node
// Composite a white halo + status dot onto the line-art source to produce
// 3 states × 2 sizes. Re-run whenever `assets/brand/tray-source-1024.png` changes.
//
// The halo gives the line art readable contrast against any menu-bar wallpaper.
// Because the output contains both black (line) and white (halo) pixels, the
// Rust side must NOT use template mode — `icon_as_template(false)`.

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

// Halo thickness in pixels per 22pt of icon size. At 22px we get ~1px halo,
// at 44px we get ~2px — crisp on both @1x and @2x.
const HALO_PX_PER_22 = 1;

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

/**
 * Wrap a transparent-bg line-art PNG with a white halo. The halo is built by
 * dilating the alpha channel (blur + threshold) and filling the expanded mask
 * with solid white, then compositing the original on top.
 */
const addWhiteHalo = async (srcBuf, size) => {
  const haloPx = Math.max(1, Math.round((size * HALO_PX_PER_22) / 22));

  const dilatedMask = await sharp(srcBuf)
    .ensureAlpha()
    .extractChannel("alpha")
    .blur(haloPx)
    .threshold(10)
    .toBuffer();

  const whiteHalo = await sharp({
    create: {
      width: size,
      height: size,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .joinChannel(dilatedMask)
    .png()
    .toBuffer();

  return sharp(whiteHalo)
    .composite([{ input: srcBuf, top: 0, left: 0 }])
    .png()
    .toBuffer();
};

await mkdir(OUT_DIR, { recursive: true });

for (const { name, dot } of STATES) {
  for (const { suffix, px } of SIZES) {
    const resized = await sharp(SOURCE)
      .resize(px, px, { kernel: "lanczos3" })
      .png()
      .toBuffer();
    const haloed = await addWhiteHalo(resized, px);

    const svg = makeDotSvg(px, dot);
    const final = svg
      ? await sharp(haloed)
          .composite([{ input: svg, top: 0, left: 0 }])
          .png()
          .toBuffer()
      : haloed;

    const outPath = path.join(OUT_DIR, `tray-${name}${suffix}.png`);
    await writeFile(outPath, final);
    console.log(`wrote ${path.relative(ROOT, outPath)}`);
  }
}
