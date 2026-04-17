# Brand Assets

Two line-art masters (one per context) + one derived desktop logo.

## Sources (commit these as-is)

- `tray-source-1024.png` — **MASTER** for the menu-bar tray icon.
  1024×1024, transparent bg, thin black strokes tuned to read at 22–44pt.
- `dock-source-1024.png` — **MASTER** for the Dock/app icon.
  1024×1024, transparent bg, thicker bolder strokes tuned to read at 512–1024pt
  on the silver squircle.

## Derived (do not edit by hand)

- `ccb-logo-1024.png` — silver-metallic squircle + dark-gray line art, generated
  from `dock-source-1024.png` by `npm run build:desktop-icon`. Consumed by
  `npm run tauri icon assets/brand/ccb-logo-1024.png` to produce the full icon
  set under `src-tauri/icons/`.

## Regeneration flow

After editing either source:

```
npm run build:desktop-icon     # dock-source-1024.png → ccb-logo-1024.png
npm run tauri icon assets/brand/ccb-logo-1024.png
npm run build:tray-icons       # tray-source-1024.png → src-tauri/icons/tray/*.png
```

## Re-squaring a non-square source

If either source arrives non-square from a design tool, run
`node scripts/prep-brand-assets.mjs` to pad both to 1024×1024 in-place
(transparent padding).
