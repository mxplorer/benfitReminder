# Tauri Bridge Module

## Overview

TypeScript wrappers around Tauri APIs. Every function checks for `__TAURI_INTERNALS__` before calling native APIs and no-ops gracefully in browser dev mode. All dynamic-import Tauri packages to avoid build errors outside Tauri context.

## Files

| File | Purpose |
|------|---------|
| `bridge.ts` | File I/O: loadData, saveData, exportToFile, importFromFile |
| `persistence.ts` | Store hydration on startup + debounced auto-save subscription |
| `tray.ts` | updateTrayBadge → invokes Rust `update_tray_badge` command |
| `notifications.ts` | checkAndSendReminders → permission check + send via notification plugin |

## bridge.ts Functions

| Function | What it does |
|----------|-------------|
| `loadData()` | Read `data.json` from `appConfigDir()`. Returns `null` if file missing (first launch). |
| `saveData(json)` | Write to `appConfigDir()/data.json`. Creates dir with `mkdir({ recursive: true })`. |
| `exportToFile(json)` | Opens native save dialog (`@tauri-apps/plugin-dialog`), writes to user-chosen path. |
| `importFromFile()` | Opens native file picker, reads selected file, returns contents as string. |

Data path: `~/Library/Application Support/com.ccb.app/data.json` (macOS).

## persistence.ts

Called once from `MainWindow.useEffect`:
1. `loadData()` → if JSON exists, `store.importData(json)` to hydrate
2. `useCardStore.subscribe()` → on every state change, debounced `saveData()` (500ms)

The debounce ensures rapid mutations (e.g., clicking multiple check buttons) don't cause excessive file writes.

## Rust Side (lib.rs)

### Commands
- `update_tray_badge(count: i32)` — updates tray icon tooltip with count

### Tray Icon
- Left-click: `toggle_tray_panel()` — creates or shows/hides the tray webview window
- Right-click menu: "显示 Benefits" (toggles panel), "退出" (exits app)
- Tray window: 420x600, no decorations, always-on-top, loads `index.html?window=tray`

### Plugins Registered
`opener`, `notification`, `dialog`, `fs`, `autostart` (MacosLauncher::LaunchAgent)

## Browser Dev Mode

When running `npm run dev` (no Tauri), all tauri/ functions silently no-op:
- `"__TAURI_INTERNALS__" in window` check fails → early return
- Store works in-memory only (no persistence)
- Export/import in Settings falls back to `<a download>` / `<input type="file">`
- Tray badge and notifications are skipped

This means `npm run dev` is fully functional for UI development without Rust toolchain.
