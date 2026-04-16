# Brand Assets

Source artwork for app icons. These are inputs, not built artifacts — commit them as-is.

- `ccb-logo-1024.png` — 1024×1024 PNG. Blue background, white card+bell line art.
  Consumed by `npm run tauri icon assets/brand/ccb-logo-1024.png` to regenerate
  everything under `src-tauri/icons/`.
- `tray-source-1024.png` — 1024×1024 PNG. Transparent background, black card+bell line art.
  Consumed by `scripts/build-tray-icons.mjs` to generate `src-tauri/icons/tray/*.png`.

## Re-squaring a source

If either source arrives non-square (typical exports from design tools), run
`node scripts/prep-brand-assets.mjs` to pad it to 1024×1024 in-place. The logo
gets blue padding matching the artwork; the tray source gets transparent padding.
