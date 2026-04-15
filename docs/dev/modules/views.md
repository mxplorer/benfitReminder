# Views Module

## Overview

React components organized by window: `tray/` for the menu bar panel, `main/` for the primary window, `shared/` for reusable primitives.

## Tray Panel (`views/tray/`)

| Component | Role |
|-----------|------|
| `TrayPanel` | Container: header (unused count + 详情窗口 link), tab bar, content, dismiss footer |
| `ByCardView` | Benefits grouped by enabled card → 2-column grid of compact `BenefitCard` |
| `ByUrgencyView` | All unused benefits flat-sorted by daysRemaining ascending |

**Tab state is local** (not persisted). Dismiss sets `settings.dismissedDate` to suppress reminders for the day.

### Filtering Logic (both views)
- Only enabled cards
- Only non-hidden, `isApplicableNow` benefits
- Auto-recur subscriptions excluded from ByUrgencyView (they don't need manual action)

## Main Window (`views/main/`)

| Component | Role |
|-----------|------|
| `MainWindow` | Layout: sidebar (200px) + content area. Owns `activeView` state. Inits persistence, tray badge sync, and notifications. |
| `Sidebar` | Nav buttons (Dashboard / 历史记录 / 设置) + card list with unused count badges |
| `Dashboard` | Period info bar, year selector, 3-column ROI summary, per-card progress rows |
| `CardDetail` | Card header, 4-cell ROI strip, benefits grid with filter pills, usage history table |
| `CardEditor` | Form: template selector pre-fills fee+color+benefits. Create or edit mode. |
| `BenefitEditor` | Form: conditional fields per resetType (calendar→period/months, since_last_use→cooldown, one_time→expiresDate). Subscription auto-replicate is per-record via the usage prompt's `propagateNext` checkbox, not a benefit-level field. |
| `Settings` | Reminder toggle+days, debug toggle, export/import (native dialog in Tauri, file input fallback in browser), danger zone reset |
| `History` | Per-card membership year ROI browser with year offset selector |

### ActiveView Routing
```ts
type ActiveView = "dashboard" | "history" | "settings" | { type: "card"; cardId: string };
```
Local state in `MainWindow`. Sidebar `onNavigate` updates it. No URL routing.

### CardDetail Filter Pills
```
全部 → non-hidden benefits
未使用 → non-hidden + not used + applicable
已使用 → non-hidden + used in current period
已隐藏 → hidden benefits only
```

## Shared Components (`views/shared/`)

| Component | Props | Notes |
|-----------|-------|-------|
| `GlassContainer` | `variant: "panel"\|"card"`, `className` | CSS class wrapper for frosted glass effect |
| `CardChip` | `color`, `size: "small"\|"normal"` | Colored rounded rectangle |
| `StatusTag` | `daysRemaining`, `isUsed` | Shows 已使用 / 即将到期 / ≤30天 / 充裕 |
| `BenefitCard` | `benefit`, `card`, `onToggleUsage`, `compact?` | Full benefit display with check button. `compact` hides description. |

## Design Decisions

- **No React Router**: views are simple enough for local state routing. The sidebar is always visible.
- **No form library**: CardEditor/BenefitEditor use plain controlled inputs. Forms are small enough to not need Formik/React Hook Form.
- **Date injection**: Components use `new Date()` at render time. Tests use `vi.setSystemTime()` for deterministic dates.
- **Store subscriptions in MainWindow**: Persistence, tray badge, and notifications are set up via `useEffect` in MainWindow (the "host" component for the main window). TrayPanel does not initialize these.
