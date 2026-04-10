# Task 21: Settings + History Views

## Goal
Build the settings page (reminders, data management) and historical ROI browser.

## Files
- Create: `src/views/main/Settings.tsx`, `src/views/main/Settings.test.tsx`
- Create: `src/views/main/History.tsx`

## Requirements

### Settings
1. **Reminder config**: enable/disable toggle, days-ahead number input — both update `store.settings`
2. **Debug logging**: toggle for `debugLogEnabled` — enables debug.log file output
3. **Data management**: Export button (calls store.exportData → file save), Import button (file picker → store.importData)
4. **Danger zone**: "恢复默认数据" button with confirmation dialog
- Log `metrics.count("data.exported")` / `metrics.count("data.imported")`

### History
- Per-card membership year browser
- Year selector per card (current year, -1, -2, etc.)
- Shows ROI breakdown for selected membership year using `calculateCardROI(card, today, yearOffset)`
- No interaction needed — read-only view

## Test Requirements
- Reminder toggle changes store setting
- Reminder days input updates store
- Export button triggers exportData
- ~3 tests minimum

## Acceptance Criteria
- [ ] All tests pass
- [ ] Lint clean
- [ ] Commit: `add Settings and History views`
