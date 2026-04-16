#!/usr/bin/env node
// Normalize `assets/brand/*.png` to 1024×1024 square, padding non-square inputs
// so the composition is preserved. Idempotent: if the input is already 1024×1024,
// running this again is a no-op-equivalent.
//
// The logo is padded with the background blue used in the source so padded edges
// blend in. The tray source is padded with fully-transparent pixels.

import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const BRAND = path.join(ROOT, "assets/brand");

const squareInPlace = async (name, background) => {
  const file = path.join(BRAND, name);
  const bytes = await readFile(file);
  const squared = await sharp(bytes)
    .resize(1024, 1024, { fit: "contain", background })
    .png()
    .toBuffer();
  await writeFile(file, squared);
  console.log(`normalized ${path.relative(ROOT, file)}`);
};

// Logo: pad with the blue sampled from the top edge of the original artwork.
await squareInPlace("ccb-logo-1024.png", { r: 19, g: 95, b: 250, alpha: 1 });

// Tray source: transparent padding.
await squareInPlace("tray-source-1024.png", { r: 0, g: 0, b: 0, alpha: 0 });
