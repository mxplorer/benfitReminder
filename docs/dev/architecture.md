# Architecture Overview

## System Design

Two-window Tauri v2 desktop app for macOS:
- **Tray panel** — daily benefit check-off from the menu bar
- **Main window** — card management, ROI analysis, settings

## Module Map

```
src/
├── main.tsx              # React entry point
├── App.tsx               # Window detection + routing
├── lib/                  # Infrastructure (logger, metrics)
├── models/               # TypeScript types + card templates
├── utils/                # Pure business logic
│   ├── period.ts         # Period range, usage, deadline calculations
│   ├── roi.ts            # ROI per card + aggregate
│   └── reminder.ts       # Reminder filtering
├── stores/               # Zustand state management
├── views/
│   ├── tray/             # Tray panel components
│   ├── main/             # Main window components
│   └── shared/           # Shared UI components
├── tauri/                # Tauri API wrappers
└── styles/               # CSS theme + glass utilities

src-tauri/
├── src/
│   ├── main.rs           # Binary entry point
│   └── lib.rs            # Plugin registration
├── tauri.conf.json       # Window + build config
└── capabilities/         # Permission declarations
```

## Data Flow

1. User actions → React components → Zustand store actions
2. Store mutations → JSON serialization → Tauri fs plugin → disk
3. Period/ROI/reminder utils are pure functions called by components with store data as input
4. Tray panel and main window share the same Zustand store instance (within same webview context) or sync via file (if separate webview processes)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop framework | Tauri v2 |
| Frontend | React 19, TypeScript |
| State | Zustand |
| Build | Vite |
| Test | Vitest, React Testing Library |
| Lint | ESLint v9 (flat config), Prettier |
| Backend | Rust (minimal — plugin config only) |
