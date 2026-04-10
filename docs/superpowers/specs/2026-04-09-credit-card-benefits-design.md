# Credit Card Benefits Tracker — Design Spec

## Overview

A macOS menu bar + window application for tracking credit card benefit usage and analyzing ROI. Two equal core goals:

1. **Reminder-driven** — Don't forget to use benefits before they expire
2. **Analysis-driven** — Is each card worth keeping based on annual fee vs actual value received

## Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Framework | **Tauri v2** | Lightweight (~5-10MB), native tray/notification support via plugins, good macOS integration |
| Frontend | **React + TypeScript** | Universal skills, rich ecosystem, strong Claude Code generation quality |
| State Management | **Zustand** | Minimal API, precise re-render, no Provider boilerplate |
| Storage | **JSON file** (`~/.config/ccb/data.json`) | Human-readable, trivial export/import, sufficient for <1000 records |
| Build | **Vite** | Fast dev server, standard React tooling |
| Styling | **CSS with design tokens** | `prefers-color-scheme` for auto light/dark theme |

### Tauri v2 Plugins Required

- `tray` — Status bar icon with badge
- `notification` — System notifications for deadline reminders
- `fs` — Read/write JSON data file
- `dialog` — File picker for import/export
- `autostart` — Login item (optional)
- `window` — Multi-window (tray panel + main window)

## Data Model

### Template Data (built-in, read-only)

```typescript
interface CardType {
  slug: string                // "amex_platinum", "chase_sapphire_preferred", etc.
  name: string                // "Amex Platinum"
  defaultAnnualFee: number    // 695
  color: string               // "#8E9EAF"
  defaultBenefits: BenefitTemplate[]
}

interface BenefitTemplate {
  name: string                // "$20 Digital Entertainment Credit"
  description: string
  faceValue: number           // 20
  category: BenefitCategory
  resetType: ResetType
  resetConfig: ResetConfig
}

type BenefitCategory =
  | "airline" | "hotel" | "dining" | "travel"
  | "streaming" | "shopping" | "wellness"
  | "transportation" | "entertainment" | "other"

type ResetType = "calendar" | "anniversary" | "since_last_use" | "subscription" | "one_time"

interface ResetConfig {
  // calendar: natural period reset
  period?: "monthly" | "quarterly" | "semi_annual" | "annual" | "every_4_years"
  applicableMonths?: number[]   // e.g. [1,2,3,4,5,6] for H1-only benefits

  // anniversary: resets on card open date anniversary (uses card's cardOpenDate)
  // No additional config needed — computed from CreditCard.cardOpenDate

  // since_last_use: available again after cooldown from last usage
  cooldownDays?: number

  // subscription: monthly auto-recurring (e.g. Disney+, Walmart+)
  // No additional config needed — always monthly cycle

  // one_time: benefit available only once, optionally with an expiration date
  expiresDate?: string          // ISO date "2026-12-31" — after this date, benefit is no longer claimable
}
```

#### Subscription Auto-Recur

Subscription-type benefits represent monthly charges that happen automatically (e.g. streaming services billed to the card). When a benefit has `resetType: "subscription"`:

- User can toggle `autoRecur` on the Benefit to mark it as auto-recurring
- When `autoRecur = true`: system auto-generates a UsageRecord on the 1st of each month (faceValue = actualValue = benefit.faceValue). No tray panel reminder, no notification.
- When `autoRecur = false`: behaves like a normal monthly calendar benefit — shows up in tray, triggers reminders.
- Auto-generated records are still visible in usage history (marked as "自动记录").

```typescript
// Additional field on Benefit for subscription type:
interface Benefit {
  // ...existing fields...
  autoRecur: boolean          // Only meaningful when resetType = "subscription"
                              // true = auto-record monthly, skip reminders
}
```

#### One-Time / Limited-Time Benefits

Some benefits are not recurring — they can only be used once (e.g. Global Entry reimbursement on some cards) or are promotional benefits valid only within a specific date range (e.g. Chase Marriott Boundless 2026 $100 Airline Credit). When a benefit has `resetType: "one_time"`:

- The benefit is considered "used" once any `usageRecord` exists. It will never reset.
- If `resetConfig.expiresDate` is set, the benefit expires after that date. Before expiry, it appears in the tray panel with a countdown. After expiry (if unused), it's marked as "已过期" and excluded from reminders.
- If `expiresDate` is not set, the benefit has no deadline — it's available until used.
- One-time benefits still contribute to ROI when used.
- For limited-time promotional benefits (e.g. 2026-only airline credits), `expiresDate` captures the promotion end date.

Note: `every_4_years` calendar benefits (like Global Entry/TSA PreCheck) are different from one-time — they reset every 4 years. `one_time` is truly once-per-card-lifetime or once-per-promotion-period.

### User Data (persisted to JSON)

```typescript
interface CreditCard {
  id: string                  // UUID
  owner: string               // Cardholder name
  cardTypeSlug: string        // References CardType.slug; "custom" for user-created
  customName?: string         // Override display name for custom cards
  alias?: string              // User-defined alias, e.g. "小号白金"
  cardNumber?: string         // Full or partial card number; last 4 digits used for display
  annualFee: number
  cardOpenDate: string        // ISO date "2024-03-15", membership year anchor
  color: string
  isEnabled: boolean
  benefits: Benefit[]
}

// Display name logic:
// alias || "{CardType.name} ···{last4(cardNumber)}" || customName || CardType.name

interface Benefit {
  id: string                  // UUID
  name: string
  description: string
  faceValue: number
  category: BenefitCategory
  resetType: ResetType
  resetConfig: ResetConfig
  isHidden: boolean           // Hidden benefits: excluded from tray panel & notifications,
                              // but still count toward ROI if used
  usageRecords: UsageRecord[]
}

interface UsageRecord {
  usedDate: string            // ISO date "2026-04-01" — single source of truth
  faceValue: number           // Snapshot of benefit face value at time of use
  actualValue: number         // User-assessed actual value (default = faceValue)
}
```

### Key Design Decisions

1. **Nested structure** — Benefits are nested inside CreditCard, UsageRecords inside Benefit. Simple read/write for small dataset. No relational joins needed.

2. **`usedDate` is the single source of truth** — No `periodKey` stored. Both "which natural period does this belong to" and "which membership year" are computed from `usedDate` at query time.

3. **`UsageRecord.faceValue` is a snapshot** — If the user later edits a benefit's face value, historical records retain the value at time of use.

4. **`isHidden` vs deletion** — Hidden benefits remain in the data model. They can be unhidden. They don't trigger reminders but still contribute to ROI if marked as used.

## Period & Deadline Calculation

### "Is this benefit used in the current period?"

| resetType | Logic |
|-----------|-------|
| `calendar` | Any `usageRecord.usedDate` falls within the current natural period (month/quarter/half-year/year) |
| `anniversary` | Any `usageRecord.usedDate` falls within the current membership year (`cardOpenDate` to `cardOpenDate + 1 year`) |
| `since_last_use` | Most recent `usageRecord.usedDate` + `cooldownDays` > today → still cooling down; otherwise → available |
| `subscription` | If `autoRecur = true`: always considered "used" (auto-recorded). If `autoRecur = false`: same as `calendar` monthly |
| `one_time` | Any `usageRecord` exists → used. No records → available (until `expiresDate` if set) |

### "When does this benefit expire?"

| resetType | Deadline |
|-----------|----------|
| `calendar` monthly | End of current month |
| `calendar` quarterly | End of current quarter |
| `calendar` semi_annual | End of current half-year (June 30 or Dec 31), filtered by `applicableMonths` |
| `calendar` annual | Dec 31 of current year |
| `calendar` every_4_years | End of 4-year block (aligned to card open date or calendar year) |
| `subscription` (autoRecur off) | End of current month (same as monthly) |
| `subscription` (autoRecur on) | N/A — auto-recorded, no deadline |
| `anniversary` | Day before next `cardOpenDate` anniversary |
| `since_last_use` | No expiry — always available once cooldown passes |
| `one_time` (with expiresDate) | The `expiresDate` value |
| `one_time` (no expiresDate) | No deadline — available until used |

### Membership Year ROI Calculation

```
Given cardOpenDate = March 15:
  Current membership year = 2025-03-15 to 2026-03-14

For each benefit on this card:
  Filter usageRecords where usedDate is within membership year range
  Sum faceValue → face value return
  Sum actualValue → actual return

ROI = actual return / annualFee × 100%
Not recovered = actual return < annualFee
```

## Application Architecture

### Two Windows

1. **Tray Panel** — Small popup (~420×600px) anchored to tray icon. High-frequency daily use.
2. **Main Window** — Standard app window (~860×600px). Low-frequency management and analysis.

### Project Structure

```
src/
├── main.tsx                    # React entry
├── App.tsx                     # Router: tray panel vs main window
│
├── lib/
│   ├── logger.ts               # createLogger, LogLevel, transports
│   ├── metrics.ts              # MetricsCollector + LocalMetricsCollector
│   └── transports/
│       ├── console.ts          # Dev console output
│       ├── file.ts             # Log file writer with rotation
│       └── index.ts            # Transport registry + init
│
├── stores/
│   └── useCardStore.ts         # Zustand store + JSON persistence
│
├── models/
│   ├── types.ts                # TypeScript type definitions
│   └── templates.ts            # Built-in CardType templates
│
├── utils/
│   ├── period.ts               # Period calculation, deadline computation
│   ├── roi.ts                  # ROI aggregation, recovery status
│   └── reminder.ts             # Notification scheduling logic
│
├── views/
│   ├── tray/                   # Tray popup panel
│   │   ├── TrayPanel.tsx       # Container with tab switcher
│   │   ├── ByCardView.tsx      # Benefits grouped by card
│   │   ├── ByUrgencyView.tsx   # Benefits sorted by deadline
│   │   └── BenefitMiniCard.tsx # Compact benefit card for tray
│   │
│   ├── main/                   # Main window
│   │   ├── Dashboard.tsx       # ROI overview, per-card recovery progress
│   │   ├── CardDetail.tsx      # Single card: info, benefits grid, usage history
│   │   ├── CardEditor.tsx      # Add/edit card form
│   │   ├── BenefitEditor.tsx   # Add/edit benefit form
│   │   ├── History.tsx         # Historical membership year browser
│   │   └── Settings.tsx        # Reminder config, data import/export
│   │
│   └── shared/                 # Shared components
│       ├── BenefitCard.tsx     # Frosted glass benefit card
│       ├── CardChip.tsx        # Mini card visual with gradient
│       └── GlassContainer.tsx  # Reusable frosted glass wrapper
│
└── tauri/
    └── tray.ts                 # Tauri tray + notification API wrappers
```

## UI Design

### Visual Language

- **macOS native feel** — SF Pro font, Apple system colors, frosted glass (backdrop-filter: blur)
- **Light/Dark auto-switch** — `@media (prefers-color-scheme)` with CSS custom properties
- **Light mode** — Semi-transparent white panels/cards over colorful background bleed-through
- **Dark mode** — Semi-transparent dark panels/cards with subtle light borders
- **Hover micro-interactions** — Cards lift (translateY -2px) with shadow deepening

### Color System

| Token | Light | Dark |
|-------|-------|------|
| Blue (links, active) | #007aff | #0a84ff |
| Green (safe, recovered) | #34c759 | #30d158 |
| Orange (warning) | #ff9500 | #ff9f0a |
| Red (danger, not recovered) | #ff3b30 | #ff453a |
| Panel background | rgba(245,245,247, 0.45) | rgba(28,28,32, 0.55) |
| Card background | rgba(255,255,255, 0.45) | rgba(255,255,255, 0.06) |

### Tray Panel

- **Tab switcher** at top: "按卡分组" / "按紧急度"
- **Header**: Unused count + "详情窗口 ↗" link to open main window
- **By Card mode**: Cards grouped under card headers (chip + name + badge). Benefits as frosted glass mini cards in 2-column grid.
- **By Urgency mode**: All benefits flat, sorted by days remaining (ascending). Each card shows source card chip.
- **Benefit mini card contents**: Status tag (remaining days / used / available), period label, name, description, check button
- **Status tag colors**: Red (≤7 days), Orange (≤30 days), Green (>30 days or available), Gray (used/hidden)
- **Footer**: "Dismiss · 今日不再提醒"

### Main Window — Dashboard

- **Sidebar** (200px):
  - Navigation: Dashboard, 历史记录, 设置
  - "我的卡片" section: Each card as `{name} ···{last4}` with unused count badge
- **Period info bar**: Shows current month (April 2026), quarter (Q2), half-year (H1) as pill badges. Provides at-a-glance temporal context for which benefits are currently active.
- **ROI summary**: 3-card grid — 总年费 / 面值回报 / 实际回报
- **Membership year selector**: Pill buttons for historical years. Since each card has a different membership year cycle, the Dashboard shows aggregate ROI per calendar year. Card Detail page shows ROI per that card's membership year.
- **Per-card recovery progress**: Each card as a row with chip, name, owner, renewal date, progress bar, percentage. Not-recovered cards highlighted with red left border.

### Main Window — Card Detail

- **Card header**: Card visual (gradient + last 4 digits), name, owner, annual fee, open date, renewal date, edit button
- **ROI strip**: 4-cell grid — 年费 / 面值回报 / 实际回报 / 回本率
- **Benefits grid**: 3-column, with filter pills (全部 / 未使用 / 已使用 / 已隐藏)
  - Active benefits: Frosted glass card with status tag, name, description, face value, check button
  - Used benefits: Dimmed (opacity 0.5), strikethrough name, shows actual value
  - Hidden benefits: Very dim (opacity 0.35), eye icon, "取消隐藏" action
  - "+ 添加 Benefit" dashed card at end
- **Usage history table**: Date, benefit name, face value / actual value

## Notification System

### Trigger Logic

- Compute deadline for each non-hidden, unused benefit
- If `deadline - today ≤ reminderDays` (user-configurable, default 3 days), schedule notification
- Notifications delivered via Tauri `notification` plugin (macOS system notifications)

### Notification Content

```
Title: "{Benefit name} 即将到期"
Body: "{Card display name} · 剩余 {N} 天 · 面值 ${amount}"
```

### Tray Icon Badge

- Count of non-hidden, unused benefits across all enabled cards for current period
- Displayed as red badge number on tray icon
- Updated on: app launch, benefit toggle, period change (midnight), window focus

## Data Persistence

### File Location

`~/.config/ccb/data.json` (via Tauri `fs` plugin with app config directory)

### File Structure

```json
{
  "version": 1,
  "cards": [ ...CreditCard objects... ],
  "settings": {
    "reminderEnabled": true,
    "reminderDays": 3,
    "dismissedDate": null,
    "logLevel": "info",
    "debugLogEnabled": false
  }
}
```

### Import/Export

- **Export**: Copy `data.json` to user-chosen location via file picker
- **Import**: Read user-selected JSON file, validate schema, replace current data
- Same format — export file IS the data file

## Logging & Metrics Infrastructure

### Design Goals

1. **Maintainability** — Structured, module-scoped logging with appropriate verbosity per level
2. **Debuggability** — Rich debug logs for development, concise info logs for production
3. **Future-proof metrics** — Pre-instrumented metric points that write locally now, can send remotely later

### Logger

```typescript
// src/lib/logger.ts

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  module: string;       // e.g. "store.benefits", "utils.period"
  message: string;
  data?: Record<string, unknown>;
  timestamp: string;    // ISO 8601
}

interface LogTransport {
  write(entry: LogEntry): void;
}
```

**Module-scoped loggers:**

```typescript
const log = createLogger("utils.period");
log.debug("calculating deadline", { resetType, now });
// → [DEBUG][utils.period] calculating deadline {"resetType":"calendar"}
```

**Level guidelines:**

| Level | Usage | Production |
|-------|-------|-----------|
| `debug` | Calculation intermediates, state diffs, branch decisions | OFF by default |
| `info` | One per user action: benefit checked, card added, data exported | ON |
| `warn` | Recoverable issues: JSON parse fallback, notification permission denied | ON |
| `error` | Unrecoverable: data file corrupt, store hydration failure | ON |

**Rule: Each user action produces at most ONE info log.** Debug logs are unlimited but gated behind the debug level flag.

### Metrics Collector

```typescript
// src/lib/metrics.ts

interface MetricEvent {
  name: string;
  type: "count" | "gauge" | "timing";
  value: number;
  tags?: Record<string, string>;
  timestamp: string;
}

interface MetricsCollector {
  count(name: string, tags?: Record<string, string>): void;
  gauge(name: string, value: number, tags?: Record<string, string>): void;
  timing(name: string, durationMs: number, tags?: Record<string, string>): void;
}
```

**Pre-instrumented metric points:**

| Metric | Type | Where |
|--------|------|-------|
| `app.launched` | count | App startup |
| `tray.opened` | count | Tray panel show |
| `benefit.checked_off` | count | Usage toggle |
| `benefit.auto_recur` | count | Auto-record generated |
| `card.added` | count | Card creation |
| `card.removed` | count | Card deletion |
| `data.exported` | count | Export action |
| `data.imported` | count | Import action |
| `notification.sent` | count | Notification dispatched |
| `notification.clicked` | count | Notification interaction |
| `store.hydrate_ms` | timing | Data load from disk |
| `store.persist_ms` | timing | Data save to disk |
| `roi.calculated` | count | ROI computation |

### Transport Architecture

```
Application code → Logger / MetricsCollector (interfaces)
                          ↓
              ┌───────────┴───────────┐
              ▼                       ▼
     LocalTransport (v1)      RemoteTransport (future)
     - ConsoleTransport       - HTTP POST batched
       (dev only)             - Offline queue
     - FileTransport          - Retry with backoff
       (~/.config/ccb/logs/)
     - MetricsFileTransport
       (metrics.jsonl)
```

**Local file layout (`~/.config/ccb/logs/`):**

| File | Content | Rotation |
|------|---------|----------|
| `app.log` | info + warn + error | Daily, keep 7 days |
| `debug.log` | All levels | Only when debug mode enabled |
| `metrics.jsonl` | One JSON metric event per line | Daily, keep 30 days |

**Debug mode toggle:** Accessible via tray context menu → "Enable Debug Logging". Persisted in `AppSettings`. Allows field debugging without rebuilding.

**Future remote transport:** Swap in `RemoteTransport` at initialization — application code unchanged. Batches events (50 items or 30s interval), queues offline, retries on reconnect. Endpoint: `POST /api/v1/events` (logs + metrics unified).

### Settings Extension

```typescript
interface AppSettings {
  // ...existing fields...
  logLevel: LogLevel;           // Default: "info" in prod, "debug" in dev
  debugLogEnabled: boolean;     // Manual override for debug.log file output
}
```

### Project Structure Addition

```
src/lib/
  logger.ts               # createLogger, LogLevel, LogEntry, LogTransport
  logger.test.ts
  metrics.ts              # MetricsCollector interface + LocalMetricsCollector
  metrics.test.ts
  transports/
    console.ts            # Dev console output (pretty-printed)
    file.ts               # Tauri fs log file writer with rotation
    index.ts              # Transport registry + initialization
```

## Built-in Card Templates

### Amex Platinum ($895/year)

Annual fee increased from $695 to $895 (effective at renewal on or after Jan 2, 2026 for existing cardholders).

| Benefit | Face Value | Period | Reset Type |
|---------|-----------|--------|------------|
| $300 Hotel Credit FHR/THC (H1) | $300 | semi_annual | calendar (months 1-6) |
| $300 Hotel Credit FHR/THC (H2) | $300 | semi_annual | calendar (months 7-12) |
| $200 Airline Fee Credit | $200 | annual | calendar |
| $200 Oura Ring Credit | $200 | annual | calendar |
| $209 CLEAR+ Credit | $209 | annual | subscription |
| $100 Global Entry / TSA PreCheck | $100 | every_4_years | calendar |
| $100/quarter Resy Dining Credit | $100 | quarterly | calendar |
| $75/quarter Lululemon Credit | $75 | quarterly | calendar |
| $25/mo Digital Entertainment | $25 | monthly | subscription |
| $15/mo Uber Cash (Jan-Nov) | $15 | monthly | calendar (months 1-11) |
| $35 Uber Cash (Dec) | $35 | monthly | calendar (month 12) |
| $120/yr Uber One Membership | $120 | annual | subscription |
| $12.95/mo Walmart+ | $12.95 | monthly | subscription |

### Amex Hilton Aspire ($550/year)

| Benefit | Face Value | Period | Reset Type |
|---------|-----------|--------|------------|
| $200 Hilton Resort Credit (H1) | $200 | semi_annual | calendar (months 1-6) |
| $200 Hilton Resort Credit (H2) | $200 | semi_annual | calendar (months 7-12) |
| $50/quarter Flight Credit | $50 | quarterly | calendar |
| $209 CLEAR+ Credit | $209 | annual | subscription |
| Free Weekend Night Award | $0 | annual | anniversary |
| $100 Waldorf/Conrad Credit | $100 | per stay | since_last_use (cooldown: 0) |

### Chase Sapphire Preferred ($95/year)

| Benefit | Face Value | Period | Reset Type |
|---------|-----------|--------|------------|
| $50 Annual Hotel Credit | $50 | annual | anniversary |
| $10/mo DashPass Promo Credit | $10 | monthly | calendar |
| DashPass Membership ($120/yr value) | $120 | annual | subscription |

### Chase Sapphire Reserve ($795/year)

Annual fee increased from $550 to $795 (effective 2025).

| Benefit | Face Value | Period | Reset Type |
|---------|-----------|--------|------------|
| $300 Annual Travel Credit | $300 | annual | anniversary |
| $250 The Edit Hotel Credit | $250 | annual | calendar |
| $250 Select Hotel Credit | $250 | annual | calendar |
| $150 Exclusive Tables Dining (H1) | $150 | semi_annual | calendar (months 1-6) |
| $150 Exclusive Tables Dining (H2) | $150 | semi_annual | calendar (months 7-12) |
| $120 Global Entry / TSA PreCheck | $120 | every_4_years | calendar |
| $25/mo DoorDash Promo | $25 | monthly | calendar |
| DashPass Membership ($120/yr value) | $120 | annual | subscription |
| $10/mo Peloton Membership | $10 | monthly | subscription |
| $5/mo DoorDash Credit | $5 | monthly | calendar |

### Chase Marriott Bonvoy Boundless ($95/year)

| Benefit | Face Value | Period | Reset Type |
|---------|-----------|--------|------------|
| Free Night Award (up to 35k pts) | $0 | annual | anniversary |
| $50 Airline Credit (H1 2026) | $50 | one_time | one_time (expires 2026-06-30) |
| $50 Airline Credit (H2 2026) | $50 | one_time | one_time (expires 2026-12-31) |
| 15 Elite Night Credits | $0 | annual | calendar |

Note: The $100 Airline Credit is a 2026 limited-time promotional benefit, split into two $50 semi-annual credits. Each requires $250+ spend directly with airlines. Modeled as two separate `one_time` benefits with `expiresDate` to capture the promotion window. These will naturally disappear from reminders after their expiration dates.

## Feature Checklist

1. **Tray panel**: Two view modes (by card / by urgency), tab switching
2. **Tray panel**: One-click benefit check-off with optional actual value input
3. **Tray icon**: Badge showing unused benefit count
4. **System notifications**: Deadline-based reminders (configurable days ahead)
5. **Dashboard**: ROI overview with per-card recovery progress and not-recovered highlighting
6. **Card detail**: Benefit card grid with filter (all/unused/used/hidden), usage history
7. **Membership year selector**: Current + historical year ROI browsing
8. **Card management**: Create from template, customize, alias/card number, multiple cards of same type
9. **Benefit management**: Add/edit/delete, hide unwanted benefits
10. **Data import/export**: JSON file, same format as internal storage
11. **Light/Dark theme**: Auto-follows macOS system preference
12. **Five benefit reset types**: Calendar (natural period), Anniversary (card open date), Since-last-use (cooldown), Subscription (monthly auto-recur option), One-time (single use with optional expiration)
13. **Dismiss**: Close tray panel for today, resets next day

## Out of Scope (v1)

- iCloud sync
- Mobile companion app
- Automatic benefit detection from bank transactions
- Multi-language (UI is mixed Chinese/English, matching user preference)
