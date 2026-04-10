# Architecture Overview

## What This App Does

macOS menu bar app for tracking credit card benefit usage and ROI. Two windows:
- **Tray panel** (420x600, no decorations) — quick daily check-off from the menu bar icon
- **Main window** (1024x768) — card management, ROI dashboard, settings, history

## Module Map

```
src/
├── main.tsx              # React entry, mounts <App/>
├── App.tsx               # Window routing: reads Tauri window label → TrayPanel or MainWindow
│
├── lib/                  # Infrastructure
│   ├── logger.ts         # createLogger("module") → structured log
│   ├── metrics.ts        # MetricsCollector: count/gauge/timing
│   └── transports/       # initTransports() wires logger + metrics sinks
│
├── models/
│   ├── types.ts          # All TypeScript types + getCardDisplayName()
│   └── templates.ts      # CARD_TEMPLATES: 5 built-in card definitions with default benefits
│
├── utils/                # PURE functions — no store, no side effects
│   ├── period.ts         # Period ranges, usage check, applicability, deadline, daysRemaining
│   ├── roi.ts            # calculateCardROI, calculateDashboardROI, getMembershipYearRange
│   └── reminder.ts       # getBenefitsDueForReminder (filters + sorts by urgency)
│
├── stores/
│   └── useCardStore.ts   # Zustand store: cards[], settings, all CRUD actions
│
├── tauri/                # Tauri API wrappers — all no-op gracefully in browser dev mode
│   ├── bridge.ts         # loadData/saveData (appConfigDir), exportToFile/importFromFile (dialog)
│   ├── persistence.ts    # initPersistence(): hydrate store from disk + subscribe for auto-save
│   ├── tray.ts           # updateTrayBadge(count) → invoke Rust command
│   └── notifications.ts  # checkAndSendReminders() → Tauri notification plugin
│
├── views/
│   ├── tray/
│   │   ├── TrayPanel.tsx     # Container: header (count + 详情窗口 link), tabs, dismiss
│   │   ├── ByCardView.tsx    # Benefits grouped by card in 2-col grid
│   │   └── ByUrgencyView.tsx # Flat list sorted by daysRemaining ascending
│   │
│   ├── main/
│   │   ├── MainWindow.tsx    # Sidebar + content area, inits persistence/tray/notifications
│   │   ├── Sidebar.tsx       # Nav items + card list with unused badges
│   │   ├── Dashboard.tsx     # Period bar, year selector, ROI summary, per-card progress
│   │   ├── CardDetail.tsx    # Card header, ROI strip, benefits grid (with filter pills), usage history table
│   │   ├── CardEditor.tsx    # Add/edit card form with template selector
│   │   ├── BenefitEditor.tsx # Add/edit benefit form with conditional fields per resetType
│   │   ├── Settings.tsx      # Reminder config, debug toggle, export/import, danger zone
│   │   └── History.tsx       # Per-card membership year ROI browser
│   │
│   └── shared/
│       ├── GlassContainer.tsx # Frosted glass wrapper (panel or card variant)
│       ├── CardChip.tsx       # Colored rectangle representing a card
│       ├── StatusTag.tsx      # Pill badge: 已使用/即将到期/充裕/已过期
│       ├── BenefitCard.tsx    # Single benefit card with status, value, check button
│       └── statusTagUtils.ts  # getStatusType() + label logic
│
└── styles/
    ├── theme.css          # Design tokens (light/dark), semantic aliases, global resets
    └── glass.css          # Glass utilities, benefit card layout, status tag styles

src-tauri/
├── src/
│   ├── main.rs           # Binary entry
│   └── lib.rs            # Plugin registration, tray icon setup, update_tray_badge command
├── Cargo.toml            # tauri + plugins: opener, notification, dialog, fs, autostart
├── tauri.conf.json       # Main window config (label "main"), build commands
└── capabilities/
    └── default.json      # Permissions: core, opener, notification, dialog, fs for main + tray
```

## Data Flow

### Store → UI (read path)
```
useCardStore (Zustand) ──→ React components subscribe via selectors
                      ──→ Pure utils (period, roi, reminder) compute derived values
```

### User Action → Persistence (write path)
```
UI event → store action → new state
                       ↓
         useCardStore.subscribe (in persistence.ts)
                       ↓
         debounced saveData() → Tauri fs → ~/.config/ccb/data.json
```

### App Startup Sequence
```
1. main.tsx renders <App/>
2. App.tsx detects window label → renders MainWindow or TrayPanel
3. MainWindow useEffect → initPersistence()
   a. loadData() reads JSON from disk
   b. importData(json) hydrates store
   c. subscribe() starts auto-save on future mutations
4. MainWindow useEffect → subscribe to store → updateTrayBadge + checkAndSendReminders
5. Tauri lib.rs setup → creates tray icon (panel created on-demand at first click)
```

### Tray Panel Window Lifecycle
```
1. User clicks tray icon → Rust toggle_tray_panel()
2. First click: WebviewWindowBuilder creates "tray" window → loads index.html?window=tray
3. App.tsx sees ?window=tray → renders <TrayPanel/>
4. Subsequent clicks: show/hide existing window
5. TrayPanel reads from same Zustand store (shares JS context? No — separate webview)
   → Tray currently gets a fresh empty store. File persistence needed for cross-window sync.
```

**Known limitation:** Tray and main windows are separate webviews with separate JS contexts. The tray panel won't see store changes from the main window in real-time. Both read from the same JSON file on disk, but the tray would need to re-hydrate to pick up changes. A future enhancement could use Tauri events for cross-window sync.

## Key Domain Concepts

### Reset Types
The core complexity lives in `period.ts`. Each benefit has a `resetType` that determines its usage cycle:

| Type | Meaning | Example |
|------|---------|---------|
| `calendar` | Resets on calendar boundaries (monthly/quarterly/etc) | "$200 airline credit per year" |
| `anniversary` | Resets on card open date anniversary | "Free night per membership year" |
| `since_last_use` | Cooldown period after each use | "TSA PreCheck every 4.5 years" |
| `subscription` | Monthly subscription (optionally auto-tracked) | "$20/mo streaming credit" |
| `one_time` | Never resets, optionally expires | "Welcome bonus within 3 months" |

### ROI Calculation
- `calculateCardROI` sums usage records within a **membership year** (cardOpenDate anniversary to next)
- `calculateDashboardROI` sums across a **calendar year** for all enabled cards
- Both use `sumRecordsInRange` which looks at `usageRecord.usedDate` within a date range
- `usageRecord.faceValue` is snapshotted at check-off time (immutable)

### Unused Benefit Count
`getUnusedBenefitCount()` in the store counts benefits that are:
- On an enabled card
- Not hidden
- Not auto-recur subscription
- Applicable now (passes month/expiry filter)
- Not used in current period

This count drives the tray badge and sidebar badges.

## Testing Architecture

190 tests across 20 files:

| Layer | Location | What it tests |
|-------|----------|---------------|
| Unit (pure logic) | `src/utils/*.test.ts` | Period ranges, usage, deadlines, ROI, reminders |
| Unit (models) | `src/models/*.test.ts` | Types, display names, templates |
| Unit (infra) | `src/lib/*.test.ts` | Logger, metrics |
| Store integration | `src/stores/*.test.ts` | CRUD actions, state transitions |
| Component | `src/views/**/*.test.tsx` | Render, click handlers, store integration |
| Cross-module | `tests/*.test.ts` | Multi-step flows (add card → use benefit → verify ROI) |

All component tests use `vi.useFakeTimers()` + `vi.setSystemTime()` to pin dates for deterministic period calculations.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop | Tauri v2 (Rust backend, WebView frontend) |
| Frontend | React 19, TypeScript strict |
| State | Zustand (single store, no middleware) |
| Build | Vite |
| Test | Vitest, React Testing Library, jsdom |
| Lint | ESLint v9 flat config, Prettier, Clippy |
