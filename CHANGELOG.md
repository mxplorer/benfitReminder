# Changelog

All notable changes to Credit Card Benefits Tracker are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow [Semantic Versioning](https://semver.org/).

## [0.1.1] — 2026-04-26

Cumulative-consumption model rewrite, sidebar / tray / dashboard / settings
redesign, and a deeper CardDetail with shared form components.

### Added

**Multi-record consumption model**
- A benefit cycle can now hold multiple usage records (instead of a single
  upsert). "Used" flips when cumulative `record.faceValue` ≥ benefit
  `faceValue`, so you can log partial spends ("$8 of the $25 monthly
  credit") and the remaining $17 stays available.
- Subscription `propagateNext` chains are materialised on data hydrate so
  carry-forward records appear automatically without a manual re-tick.
- `BenefitHistoryDialog` — per-benefit modal listing every usage record
  with edit / delete (sorted by date desc).

**CardDetail**
- Year-mode toggle (`日历年` ↔ `会员年`) sits left of the ⋯ action; flips
  the hero ROI, 已兑现, ROI strip, and the benefit grid's cycle scope
  together so the page stays internally consistent.
- Hero 等效年费 number uses the same tri-state animated gradient as the
  Dashboard tile (recovered / warning / danger) so the same card shows
  the same color in both places.
- ⋯ menu on benefit cards: 管理使用 (opens BenefitHistoryDialog), 隐藏 /
  取消隐藏, 删除权益 (template benefits stay protected).
- Per-record edit + delete on the bottom history table.

**AggregatedBenefitCard (monthly + subscription view)**
- ⋯ menu (管理使用 / 隐藏 / 删除) so monthly subscription pills aren't
  read-only.
- 本月 progress bar showing current-cycle consumed / face, colored by
  state (green / amber / grey).
- 本月 action button on the collapsed pill — `+ 使用 $X`,
  `+ 再用一次 ($remaining 剩)`, or `✓ 已用完` (uncheck) — so the use
  affordance is one click, no expand needed.
- `BenefitUsagePrompt` extracted from BenefitCard and reused by the
  pill: same form (本次面值 / 实际到手 / 使用日期 / 自动续期下月) and
  same auto-sync between the two amount fields, in one place.

**Sidebar**
- Collapsible 52px rail with glass + aurora backdrop.
- Edge-trigger reveal + `⌘B` keyboard shortcut.
- Pill badges aligned to baseline.

**Tray**
- Frosted glass + aurora accent.
- Segmented filter tabs (matches the new BenefitFilterBar style).
- Single-row BenefitRow layout with Dashboard-style consumption bar.
- Status-aware summary header (value / unused count / urgent).

**Dashboard**
- Hero typography scaled ~20% with tighter spacing for hierarchy.
- Hero label `待拿` renamed `待使用` (matches the rest of the vocabulary).
- 本月 chip stays inline with the 等效年费 number (no awkward wrap).

**Settings**
- Row-layout redesign with a polished `Switch` component for booleans.

**Theme**
- `data-theme-effective` is driven by App, so the tray webview follows
  the user's theme preference instead of always reading the system.

### Changed

**Templates**
- Amex Platinum + Hilton Aspire CLEAR+ benefit switched from
  `subscription` (12 monthly cycles) to `calendar / annual`. Both
  templates bumped to `version: 2` so existing user cards re-sync on
  next load.

**Filter semantics**
- The `年终 / 周年` scope toggle moves out of `BenefitFilterBar` — the
  CardDetail year-mode toggle is now the single source of truth for
  cycle scope.
- `未使用` now keeps **past empty cycles** (anniversary / quarterly /
  semi-annual / annual / every_4_years) visible, rendered as a disabled
  grey `已过期` button. Tile body still says `未使用`. Previously these
  were silently dropped, so users couldn't see what they'd let lapse.

**Rollover**
- Records store the *real* rolled amount (partial rollover supported)
  instead of always the full face value.
- Per-cycle `totalFace` includes inbound rollover from the prior cycle.
- Per-cycle rollover toggle moved to a small dedicated dialog; the
  per-record edit/delete affordance moved to the new history dialog.

**BenefitCard**
- One_time benefits with a future `availableFromDate` are now correctly
  treated as `notYetActive` (button reads `未激活`, title shows
  activation date). Previously they were usable from the day the
  benefit was added.
- Past empty cycles render as `已过期` with a disabled grey button
  (status text stays `未使用`).
- Consumption progress bar persists at 100% green when fully used.
- ⋯ action menu in the top-right.

### Fixed

- ⋯ dropdown was clipped under adjacent tile (stacking context).
- `已隐藏` filter — action menu stayed invisible after `取消隐藏`.
- `RolloverEditDialog` amount input no longer traps a leading `0`.

### Engineering

- 695 unit + integration + E2E tests across 46 files (up from 496 / 40).
- `BenefitUsagePrompt` extraction collapsed BenefitCard from ~200 lines
  of inline form state to a single component invocation; same component
  powers the AggregatedBenefitCard's pill action.
- `calculateCardROI` now accepts an optional `rangeOverride` so the same
  function serves both calendar-year and membership-year scopes without
  duplication.

## [0.1.0] — 2026-04-16

First public release. A macOS menu-bar app for tracking credit card benefit
usage and computing whether each card's annual fee pays for itself.

### Added

**Surfaces**
- **Menu-bar tray panel** (420×600) with two views: grouped by card, or a
  flat list sorted by urgency (days-remaining ascending).
- **Main window** (1024×768): Dashboard with ROI summary, CardDetail with
  filter pills and usage history, Card/Benefit editors, History browser
  (per membership year), Settings.
- **State-aware tray icon** — three preloaded variants (clean / unused /
  urgent) swapped based on benefit state, with a colored status dot.

**Benefit period types**
- `calendar` — monthly, quarterly, semi-annual (H1/H2), yearly, with
  `applicableMonths` filtering.
- `anniversary` — full-year window anchored to card open date, with optional
  statement-close alignment for hotel credits (e.g. CSR hotel credit).
- `since_last_use` — cooldown timers (e.g. Aspire free night certs).
- `subscription` — monthly recurring (e.g. CLEAR, DoorDash) with
  auto-replicate from the last record's actual value and per-month cancel
  support via `propagateNext`.
- `every_4_years` — e.g. Global Entry / TSA PreCheck.
- `one_time` — with `availableFromDate` so future-dated benefits still
  surface in the "未使用" list before they become active.

**ROI + reminders**
- Per-card and dashboard ROI: benefits used × faceValue snapshot − annual
  fee, for the current membership year or calendar year (scope labeled).
- History view: browse prior membership years.
- Rollover records: accumulate unused balance across cycles, with a
  dedicated edit dialog (⚙) for adjusting past-cycle totals and a per-cycle
  quick entry (⟳).
- Backfill dialog for entering past usage retroactively, with monthly
  benefits aggregated into a single 12-checkbox card.
- Native macOS notifications for benefits approaching deadline.

**Card templates with versioning**
- Six built-in card templates ship with the app; user-added cards bind to a
  templateBenefitId so future template updates propagate cleanly without
  overwriting user edits. Legacy name-based cards are auto-migrated on load.

**Data + integration**
- Local JSON persistence at `~/Library/Application Support/com.ccb.app/`
  (debounced auto-save on every store mutation).
- Export / import data as JSON.
- Auto-start on login (optional, via tauri-plugin-autostart).
- Light and dark mode with polished contrast tokens.

### Supported cards (built-in templates)

| Card | Annual fee | Default benefits | Template v |
|---|---:|---:|---:|
| Amex Platinum | $895 | 12 | v1 |
| Chase Sapphire Reserve | $795 | 10 | v1 |
| Hilton Aspire | $550 | 6 | v1 |
| Chase Marriott Boundless | $95 | 4 | v1 |
| Chase Sapphire Preferred | $95 | 3 | v2 |
| Chase World of Hyatt | $95 | 2 | v1 |

You can add any other card manually via Card Editor — the six above just
ship with pre-filled benefit lists.

### Known limitations

- The DMG is **not signed** — first launch requires right-click → Open or
  `xattr -cr "/Applications/Credit Card Benefits.app"`. See the README
  for details.
- `npm run tauri dev` opens a blank window on some setups; use
  `npm run dev` (browser mode) for UI development. Production builds are
  unaffected.
- Tray panel renders in a separate webview from the main window; the two
  stay in sync via on-disk persistence reloads, not in-memory events.
- AggregatedBenefitCard shows `$0` for autoRecur subscription
  used-summaries when individual records carry no actualValue.

### Engineering

- 496 unit + integration + E2E tests across 40 files (Vitest + React
  Testing Library).
- ESLint v9 flat config with type-aware rules; `@typescript-eslint/no-explicit-any` as error.
- Rust side clean under `cargo clippy -- -D warnings`.

[0.1.0]: https://github.com/mxplorer/benfitReminder/releases/tag/v0.1.0
[0.1.1]: https://github.com/mxplorer/benfitReminder/releases/tag/v0.1.1
