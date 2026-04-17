# Changelog

All notable changes to Credit Card Benefits Tracker are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow [Semantic Versioning](https://semver.org/).

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

[0.1.0]: https://github.com/<you>/ccb/releases/tag/v0.1.0
