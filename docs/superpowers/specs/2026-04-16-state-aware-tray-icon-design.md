# State-Aware Tray Icon — Design

**Date:** 2026-04-16
**Status:** Approved (awaiting spec review)

## Motivation

The menu-bar tray icon today shows the same static image regardless of state. Users have to open the tray panel (or rely on desktop notifications) to learn whether anything needs attention. A glanceable, state-colored dot on the tray icon surfaces urgency without requiring interaction.

At the same time, the app has no distinct brand icon — it ships with the Tauri default — so the desktop / Dock / Finder icon is being updated in the same change.

## Goals

- Desktop app icon uses a dedicated brand mark (credit card + bell, blue).
- Tray icon is a monochrome line-art template image that adapts to macOS light/dark menu bars, with a small colored dot in the lower-right conveying state.
- Tray state updates automatically whenever benefit usage or the `reminderDays` setting changes.

## Non-Goals

- Animation or pulsing of the tray icon.
- Distinct icons for Windows and Linux beyond using the same color dot overlay (platform-native look is secondary to consistent status signaling).
- Exposing "the number of urgent benefits" on the tray icon itself — the tooltip and tray panel continue to carry the count.

## User-Facing Behavior

### Desktop app icon

- Single brand icon, blue background, white card-with-bell line art.
- Source: `assets/brand/ccb-logo-1024.png` (provided by user).
- Generated into `src-tauri/icons/` via `npm run tauri icon …`.
- No state variation.

### Tray icon — three states

| State    | When                                                                                                    | Visual                                             |
|----------|---------------------------------------------------------------------------------------------------------|----------------------------------------------------|
| `clean`  | No benefit is currently applicable *and* unused (after filtering hidden / disabled / not-applicable-now) | Line-art template only, no dot                     |
| `unused` | ≥1 applicable unused benefit exists, but none is within `reminderDays` days of its deadline             | Line-art + **yellow dot** (`#F5A623`)              |
| `urgent` | ≥1 applicable unused benefit is within `reminderDays` days of its deadline                              | Line-art + **red dot** (`#E53935`)                 |

Priority: `urgent` > `unused` > `clean`. The `clean` state intentionally shows **no dot** (matching the macOS convention that "no badge = nothing to do"). This deviates from the user's original proposal of a blue dot for the clean state, and was agreed during brainstorming.

The `reminderDays` threshold is the existing Settings value already used for desktop notifications. No new setting is introduced.

### Tooltip

Unchanged in spirit; updated alongside the icon:

- `clean` → `"Credit Card Benefits · 全部已使用"`
- `unused` → `"Credit Card Benefits · {N} 项未使用"`
- `urgent` → `"Credit Card Benefits · {N} 项未使用（{M} 项即将到期）"`

## Architecture

```
useCardStore state change   ┐
                            ├──► computeTrayState(cards, today, reminderDays) ──► TrayState
useToday day rollover       │
Settings.reminderDays change┘                                                       │
                                                                                     ▼
                                                    invoke("update_tray_status", { state, unusedCount, urgentCount })
                                                                                     │
                                                                                     ▼
                                                          Rust tray.set_icon(preloaded[state])
                                                                    + set_tooltip(...)
```

Pure computation lives in the frontend; the Rust side is a thin dispatcher that swaps preloaded `Image` handles.

## Components

### 1. `src/utils/trayState.ts` (new)

```ts
export type TrayState = "clean" | "unused" | "urgent";

export interface TrayStatus {
  state: TrayState;
  unusedCount: number;
  urgentCount: number;
}

export const computeTrayStatus = (
  cards: CreditCard[],
  today: Date,
  reminderDays: number,
): TrayStatus;
```

- Reuses `getBenefitsDueForReminder` for the urgent set.
- Reuses `isApplicableNow` + `isBenefitUsedInPeriod` + the `isHidden` / `card.isEnabled` filters for the unused set.
- Pure, deterministic, no side effects. 100% branch coverage target.

### 2. `src/tauri/tray.ts` (modified)

Replace `updateTrayBadge(count)` with:

```ts
export const updateTrayStatus = async (status: TrayStatus): Promise<void>;
```

- No-ops in browser dev mode (preserves existing guard).
- Internally calls `invoke("update_tray_status", { state, unusedCount, urgentCount })`.

### 3. `useCardStore` wiring (modified)

A single subscription point already pushes to the tray on state changes (current `updateTrayBadge` call site). Update that call site to:

1. Compute `TrayStatus` via `computeTrayStatus` using current cards, `store.now`, and `settings.reminderDays`.
2. Call `updateTrayStatus(status)`.

This subscription already re-fires on:
- Benefit usage toggles (via store mutation).
- Day rollover (via `useToday` → recalculate trigger added in commit `e06d9fa`).
- Settings changes to `reminderDays` (needs verification; if not currently wired, add a subscription).

### 4. `src-tauri/src/lib.rs` (modified)

- Drop `update_tray_badge`; add `update_tray_status`.
- At setup time, load three `Image` instances from bundled PNGs into app-managed state (e.g., `app.manage(TrayIcons { clean, unused, urgent })`).
- On command invocation, `tray.set_icon(Some(icons.<state>.clone()))` and `tray.set_tooltip(...)`.
- Tray base icon is marked as template on macOS via `set_icon_as_template(true)` — **note**: the status dot is part of the bitmap, so the dot's color is preserved; only the line art is recolored by the system. Verify this behavior on macOS (fallback: ship non-template variants per appearance if the dot gets recolored).

### 5. Icon assets

Directory layout:

```
assets/brand/
  ccb-logo-1024.png               # desktop app (blue bg, white line art) — user supplies
  tray-source-1024.png            # transparent bg, black line art — user supplies

src-tauri/icons/tray/
  tray-clean@1x.png               # 22×22
  tray-clean@2x.png               # 44×44
  tray-unused@1x.png
  tray-unused@2x.png
  tray-urgent@1x.png
  tray-urgent@2x.png
```

Generation script (`scripts/build-tray-icons.mjs`, run manually when source changes, not in build pipeline):

- Input: `tray-source-1024.png`.
- For each state, composite the dot (8×8 at 22px, scaled proportionally at 44px) in the lower-right with 1px padding from the edges.
- Output PNGs at both sizes, written into `src-tauri/icons/tray/`.
- Committed to git (checked-in artifacts, not built at runtime).

Dot geometry:

- Relative position: center at (17/22, 17/22) of icon bounds.
- Relative radius: 4/22 of icon width.
- Colors: `#F5A623` (unused), `#E53935` (urgent).

## Data Flow on Key Events

| Event                               | Trigger                                    | Result                                    |
|-------------------------------------|--------------------------------------------|-------------------------------------------|
| User checks off a benefit           | `useCardStore.toggleUsage`                 | Recompute → possible state demotion       |
| Day rollover (midnight / wake)      | `useToday` → store.now update              | Recompute → possible state promotion      |
| `reminderDays` setting changed      | Settings mutation                          | Recompute → possible state promotion/demotion |
| App startup                         | After store hydration                      | Initial compute + tray setIcon            |

## Testing Strategy

**Layer 1 — pure logic (`src/utils/trayState.test.ts`):**

- Empty cards → `clean`.
- All cards disabled → `clean`.
- Only hidden benefits → `clean`.
- One applicable unused benefit, deadline > `reminderDays` away → `unused`.
- One applicable unused benefit, deadline exactly `reminderDays` days away → `urgent` (inclusive boundary).
- One applicable unused benefit, deadline 0 days away → `urgent`.
- Mix: some unused, one urgent → `urgent` (priority check).
- `reminderDays = 0` edge case → only same-day deadlines urgent.
- Counts (`unusedCount`, `urgentCount`) correct in each state.

**Layer 2 — store integration (`tests/tray-status-integration.test.ts`):**

- Add card → add benefit → tray status transitions `clean → unused`.
- Advance `store.now` toward deadline → transitions `unused → urgent`.
- Mark benefit used → transitions back to `clean` (or `unused` if siblings remain).
- Change `reminderDays` from 3 to 14 → state promotes to `urgent` without other changes.

**Manual / out-of-scope for automation:**

- macOS template-mode rendering (light vs dark menu bar).
- Rust icon-swap correctness (eyeballed).
- Icon legibility at actual menu-bar size.

## Rollout

Single-branch change, no feature flag. Backward compatible with data — no schema changes.

## Open Questions

None — all resolved during brainstorming.

## Dependencies the User Must Provide

1. **Desktop app logo:** 1024×1024 PNG, blue background (`#1F5BFF` or current shade), white card+bell line art. (Already produced; just needs to be dropped in.)
2. **Tray source line art:** 1024×1024 PNG, **transparent background**, **black** (or dark gray) card+bell line art. Same composition as the desktop logo, background stripped and line re-colored.

Colored dots and sized variants are generated from (2) by the build script.
