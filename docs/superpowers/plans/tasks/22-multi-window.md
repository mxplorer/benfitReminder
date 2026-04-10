# Task 22: Tauri Multi-Window Setup

## Goal
Configure Tauri for two windows (main + tray panel) with all plugins registered.

## Files
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/App.tsx`
- Create: `src-tauri/capabilities/default.json`

## Requirements

### tauri.conf.json
- Main window: label "main", 860x600, decorations=true, visible=false (shown after hydration)
- Tray panel created programmatically on tray icon click (not in config)

### lib.rs — Plugin registration
Register all plugins: notification, dialog, fs, autostart (MacosLauncher::LaunchAgent)

### App.tsx — Window detection
- `getCurrentWindow().label` → "tray" renders TrayPanel, "main" renders MainWindow
- Dev mode fallback: URL param `?window=tray` or default to main

### Capabilities
- Create permissions file granting access to notification, fs (read/write app config dir), dialog plugins

## Acceptance Criteria
- [ ] `npm run tauri dev` opens main window successfully
- [ ] Plugins registered without errors
- [ ] Commit: `configure Tauri multi-window setup with plugin registration`
