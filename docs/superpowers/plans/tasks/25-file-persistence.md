# Task 25: JSON File Persistence via Tauri fs

## Goal
Wire the store to read/write JSON data file, and implement file-based import/export.

## Files
- Create: `src/tauri/bridge.ts` (consolidates tray.ts + file ops)
- Modify: `src/stores/useCardStore.ts` — add fs hooks

## Requirements

### File operations (`bridge.ts`)
- `loadData()`: read from `~/.config/ccb/data.json` (via `appConfigDir()`). Return null if file doesn't exist.
- `saveData(data)`: write to same path. Create directory if needed (`mkdir recursive`).
- `exportToFile(data)`: open save dialog with JSON filter, write to chosen path
- `importFromFile()`: open file picker, read selected JSON file, return contents
- Log `metrics.timing("store.hydrate_ms")` on load, `metrics.timing("store.persist_ms")` on save

### Store integration
- On app init: call `loadData()` → hydrate store state
- After every mutation: debounced `saveData()` via Zustand `subscribe`
- Export/import buttons in Settings wired through these functions

## Acceptance Criteria
- [ ] Data persists across app restarts (add card → quit → relaunch → card still there)
- [ ] Export saves valid JSON to chosen location
- [ ] Import replaces state from chosen file
- [ ] Commit: `add JSON file persistence via Tauri fs plugin with import/export`
