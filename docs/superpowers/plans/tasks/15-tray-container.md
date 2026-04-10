# Task 15: Tray Panel Container

## Goal
Build the TrayPanel container with tab switching, header, and dismiss functionality.

## Files
- Create: `src/views/tray/TrayPanel.tsx`, `src/views/tray/TrayPanel.test.tsx`, `src/views/tray/TrayPanel.css`

## Requirements

### Layout (~420x600px)
1. **Header**: unused benefit count + "详情窗口 ↗" link to open main window
2. **Tab bar**: "按卡分组" / "按紧急度" toggle
3. **Content area**: conditionally renders ByCardView or ByUrgencyView
4. **Footer**: "Dismiss · 今日不再提醒" button — sets `settings.dismissedDate` to today

### Behavior
- Default tab: "按卡分组"
- Tab state is local (not persisted)
- Unused count = `getUnusedBenefitCount()` from store
- "详情窗口 ↗" opens the main window (via Tauri window API, stubbed for now)
- Dismiss sets `dismissedDate` in store settings

## Test Requirements
- Tab buttons render, clicking switches active tab
- Header shows unused count
- "详情窗口 ↗" link exists
- Dismiss button exists and sets dismissedDate on click
- ~4 tests minimum

## Acceptance Criteria
- [ ] All tests pass
- [ ] Lint clean
- [ ] Commit: `add TrayPanel container with tab switching and dismiss`
