# Task 23: Tray Icon + Badge

## Goal
Add system tray icon with badge count and panel toggle behavior.

## Files
- Modify: `src-tauri/src/lib.rs` — tray setup in `.setup()`
- Create: `src/tauri/tray.ts` — frontend tray communication

## Requirements

### Rust side (lib.rs)
- Create system tray with credit card icon in `.setup()`
- Left click: create or toggle tray panel window (small, positioned near tray area)
- Right click: context menu with "显示 Benefits", "Enable Debug Logging" toggle, "退出"
- `#[tauri::command]` fn `update_tray_badge(count: i32)` — updates tray icon with badge overlay

### Frontend side (tray.ts)
- `updateTrayBadge(count: number)` — calls the Rust command via `invoke`
- Called after any store mutation that changes usage records or card enabled state
- Log `metrics.count("tray.opened")` when panel opens

## Acceptance Criteria
- [ ] Tray icon appears in menu bar
- [ ] Click opens/closes tray panel
- [ ] Badge shows correct unused benefit count
- [ ] Right-click context menu works
- [ ] Commit: `add tray icon with badge and panel toggle`
