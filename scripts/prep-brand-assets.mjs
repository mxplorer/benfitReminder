#!/usr/bin/env node
// Normalize `assets/brand/tray-source-1024.png` to 1024×1024 square, padding
// a non-square input with transparent pixels so the composition is preserved.
// Idempotent: running it on an already-square file is a no-op-equivalent.
//
// The desktop logo (`ccb-logo-1024.png`) is derived from this master via
// `scripts/build-desktop-icon.mjs` — do not square it here.

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

await squareInPlace("tray-source-1024.png", { r: 0, g: 0, b: 0, alpha: 0 });
