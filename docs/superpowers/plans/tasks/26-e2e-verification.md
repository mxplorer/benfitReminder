# Task 26: End-to-End Verification

## Goal
Verify the complete application works through automated tests and manual smoke testing.

## Requirements

### Automated checks
1. `npm run test` — all unit + component tests pass
2. `npm run lint` — no errors
3. `cargo clippy -- -D warnings` in src-tauri — no warnings

### Manual smoke test checklist
- [ ] Tray icon appears with badge count
- [ ] Click tray → panel opens with correct benefits
- [ ] Switch tabs (按卡分组 / 按紧急度)
- [ ] Check off a benefit → badge updates, card moves to "已使用"
- [ ] Click "详情窗口 ↗" → main window opens
- [ ] Dashboard shows correct ROI numbers
- [ ] Click a card in sidebar → card detail view
- [ ] Filter pills work (全部/未使用/已使用/已隐藏)
- [ ] Add a new card from template (including Chase Marriott Boundless with one_time benefits)
- [ ] Edit card (change alias, card number)
- [ ] Hide a benefit → disappears from tray
- [ ] Toggle autoRecur on subscription benefit → no longer shows in tray
- [ ] One-time benefit: check off → permanently used, shows in ROI
- [ ] One-time benefit with expiry: shows countdown, excluded after expiration
- [ ] Export data → JSON file saved
- [ ] Import data → state replaced
- [ ] Toggle light/dark mode in System Preferences → UI updates
- [ ] Dismiss → panel closes, doesn't reopen until next day
- [ ] Debug logging toggle in tray context menu works

## Acceptance Criteria
- [ ] All automated checks pass
- [ ] All manual smoke tests pass
- [ ] Commit any fixes found during verification
- [ ] Final commit: `complete v1 implementation with end-to-end verification`

## Dev Docs
Update `docs/dev/architecture.md` with final module map and data flow diagram.
