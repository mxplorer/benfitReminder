# Task 17: Main Window Shell — Sidebar + Routing

## Goal
Build the main window layout with sidebar navigation and view routing.

## Files
- Create: `src/views/main/MainWindow.tsx`, `src/views/main/MainWindow.css`
- Create: `src/views/main/Sidebar.tsx`
- Modify: `src/App.tsx` — route between tray and main based on window label

## Requirements

### App.tsx routing
- Read Tauri window label: `"tray"` → TrayPanel, `"main"` → MainWindow
- Dev fallback: use URL param or default to main window

### Sidebar (200px width)
- Navigation items: Dashboard, 历史记录, 设置
- "我的卡片" section: list of cards from store, each as CardChip + display name + unused count badge
- Click card → navigates to card detail view
- Active item highlighted with accent color

### MainWindow layout
- Sidebar (fixed 200px) + main content area (flex)
- Local state: `activeView: "dashboard" | "history" | "settings" | { type: "card"; cardId: string }`
- Renders appropriate view component based on activeView

## Test Requirements
- Clicking sidebar items switches active view
- Card list shows cards from store
- ~3 tests minimum

## Acceptance Criteria
- [ ] All tests pass
- [ ] Lint clean
- [ ] Commit: `add main window shell with sidebar navigation`
