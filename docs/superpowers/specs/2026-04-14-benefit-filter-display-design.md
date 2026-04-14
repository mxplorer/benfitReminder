# Benefit Filter & Display Overhaul

**Date:** 2026-04-14
**Scope:** CardDetail view + Tray "按卡分组" view + per-card ROI (always anniversary)

## Problem

The current benefit filter UI on `CardDetail` has four pills (全部 / 未使用 / 已使用 / 已隐藏) whose semantics are too coarse:

- "已使用" means "used in the current reset period" — a monthly benefit used in January but not in April shows as unused, with no historical view of earlier uses in the same year.
- "未使用" only surfaces benefits that are usable *right now*; it hides future-period benefits that are knowably unused (e.g., a quarterly benefit that has Q2–Q4 remaining).
- The tray's 按卡分组 view has no filter pills at all — it shows a hardcoded "applicable now, not hidden" slice and nothing else.
- Per-card ROI (回本率) is computed over a `today`-based period that mixes calendar and anniversary assumptions, leading to off-by-year confusion around annual fee renewal.

Users want a sharper, more filterable view that distinguishes "can I use this today" from "have I already used this anywhere this year" from "what's still available to use this year," plus a per-card ROI that tracks the anniversary billing year the annual fee is charged against.

## Goals

1. Replace the 4-filter pill bar with a 5-filter model on both CardDetail and the tray 按卡分组 view.
2. Make filters independent (a benefit may appear in multiple filters simultaneously — no mutual exclusion).
3. Aggregate recurring monthly/subscription benefits in 已使用 / 未使用 / 全部 into a single expandable card.
4. Expose per-cycle cards for quarterly / semi-annual / annual benefits so each Q1/Q2/H1/H2 shows independently.
5. Add a 年终 ↔ 周年 toggle to 未使用 / 全部 that swaps the enumeration scope between calendar year and anniversary year.
6. Compute per-card ROI strictly against the current anniversary year.

## Non-goals

- No changes to the 按紧急度 tray view.
- No changes to `History` view.
- No changes to Dashboard top-level totals (stay calendar-year — aggregation across cards).
- No data model changes (no new fields on `Benefit` or `UsageRecord`).

## Filter semantics

Five filters, independent (benefits can match multiple):

| Filter | Condition | Excludes hidden? | Honors year-scope toggle? |
|---|---|---|---|
| **可使用** | `isApplicableNow(benefit, today) && !isBenefitUsedInPeriod(benefit, today, cardOpenDate)` | yes | no |
| **未使用** | current period unused, **plus** unused cycles within scope window | yes | **yes** |
| **已使用** | has any `UsageRecord` with `usedDate` in the current calendar year | yes | no (always calendar year) |
| **已隐藏** | `benefit.isHidden === true` | — (only shows hidden) | no |
| **全部** | every benefit on the card, expanded cycle-by-cycle within scope window | **no** (includes hidden) | **yes** |

**Pill order:** 可使用 / 未使用 / 已使用 / 已隐藏 / 全部.

## Year-scope toggle (未使用 / 全部 only)

A two-state toggle (年终 / 周年) appears next to the pill bar and is visible only when the active filter is 未使用 or 全部. Default: 年终. State is local to each view.

**Scope windows:**
- **年终 mode:** `[max(calendar-year-start, cardOpenDate), calendar-year-end]`
  - Edge case: card opened 2026-03-15 → scope = `[2026-03-15, 2026-12-31]`. Quarterly benefits show Q2/Q3/Q4 only (Q1 excluded since card was not held).
- **周年 mode:** `[current-anniversary-start, current-anniversary-end]`
  - e.g. card opened 2025-09-15 → current anniversary scope = `[2025-09-15, 2026-09-14]`.
  - Future cycles beyond the current calendar year are shown when they fall within the anniversary window.

**Cycle enumeration:** calendar-aligned cycles (Q1-Q4, H1/H2, Jan-Dec months) whose date range intersects the scope window. Each cycle's label carries its own year when it differs (e.g., `Q4 2025` inside a 2025-09 anniversary scope).

## Per-card ROI (regardless of filter)

`calculateCardROI(card, today)` is updated to always compute over the current anniversary year — the window `[most-recent-anniversary, next-anniversary - 1 day]` that encloses `today`. Both `faceValueReturn` and `actualReturn` sum usage records whose `usedDate` falls inside that window.

**Scope of this change:**
- `CardDetail` ROI strip — uses anniversary ROI.
- `Dashboard` per-card progress rows — use anniversary ROI.
- `Dashboard` top-level totals (`总年费 / 面值回报 / 实际回报`) — **unchanged**, still calendar-year-driven via the year selector. This is cross-card aggregation and the calendar year is the natural aggregation axis.

## Display logic per filter

Each filter expands the benefits of a card into zero or more "display items." The display item's visual form depends on the filter × reset type combination:

| Filter | monthly / subscription | quarterly / semi_annual | annual / anniversary / every_4_years | one_time / since_last_use |
|---|---|---|---|---|
| **可使用** | 1 standard card | 1 standard card | 1 standard card | 1 standard card |
| **未使用** | 1 aggregated card (unused months in scope) | 1 per-cycle card per unused cycle in scope | 1 per-cycle card if unused within scope | 1 standard card if applicable & unused |
| **已使用** | 1 aggregated card (used months this calendar year) | 1 per-cycle card per used cycle this calendar year | 1 per-cycle card if used this calendar year | 1 standard card if used this calendar year |
| **已隐藏** | 1 standard card | 1 standard card | 1 standard card | 1 standard card |
| **全部** | 1 aggregated card (all months in scope, mix of used / unused rows) | 1 per-cycle card per cycle in scope (each marked used or unused) | 1 per-cycle card per cycle in scope | 1 standard card |

### Aggregated card (monthly / autoRecur subscription)

- **Collapsed summary line:**
  - 已使用: `Uber Eats · 3 次 · 共 $45`
  - 未使用: `Uber Eats · 未使用 9 个月 · 共 $135`
  - 全部: `Uber Eats · 12 个月 · 已用 3 · 未用 9 · $45 / $180`
- **Expandable:** disclosure triangle reveals per-month rows
  - 已使用: one row per `UsageRecord` in the current calendar year (date · faceValue · actualValue)
  - 未使用: one row per unused month in scope (month label · potential faceValue)
  - 全部: one row per month in scope, used rows show record data, unused rows show face value + "待使用" affordance

### Per-cycle card (quarterly / semi_annual / annual / anniversary / every_4_years)

Visually the same as the standard `BenefitCard` but with:
- A period badge (`Q2 2026`, `H1 2026`, `2026年`, `2025年度` for anniversary benefits)
- Used cycle: shows that cycle's `UsageRecord` (actual value used, used-date)
- Unused cycle: shows face value + "待使用" affordance; the existing "mark used" button records a usage dated to today (or to the cycle start if today falls outside the cycle — matches current BenefitCard behavior)

### `applicableMonths`

Benefits with `applicableMonths` (e.g., April–October) contribute a cycle only if the cycle's month range overlaps `applicableMonths`. The entire cycle is included (no partial/fractional cycles — see Edge-case decision 1). For monthly benefits, `applicableMonths` directly controls which months the aggregate enumerates.

## Architecture

### New pure-logic module: `src/utils/benefitDisplay.ts`

```ts
export type FilterMode = "available" | "unused" | "used" | "hidden" | "all";
export type YearScope = "calendar" | "anniversary";

export interface BenefitDisplayItem {
  benefit: Benefit;
  card: CreditCard;
  key: string;                          // stable React key
  variant: "standard" | "per-cycle" | "aggregated";

  // Per-cycle fields:
  periodLabel?: string;                 // "Q2 2026", "4月", "H2 2026", "2025年度"
  periodStart?: string;                 // ISO date (inclusive)
  periodEnd?: string;                   // ISO date (inclusive)
  cycleUsed?: boolean;                  // true if this cycle has a record
  cycleRecord?: UsageRecord;            // record that made this cycle "used"

  // Aggregated fields:
  aggregate?: {
    kind: "used" | "unused" | "all";
    months: Array<{                     // one entry per month in scope
      label: string;                    // "2026-04" or "4月"
      used: boolean;
      record?: UsageRecord;             // populated if used
      faceValue: number;
    }>;
    usedCount: number;
    unusedCount: number;
    totalActualValue: number;           // sum of actualValue across used months
    totalFaceValue: number;             // sum of faceValue across all months in aggregate
  };
}

export function expandBenefitsForFilter(
  card: CreditCard,
  filter: FilterMode,
  today: Date,
  scope: YearScope,                     // ignored by filters that don't honor it
): BenefitDisplayItem[];
```

### Helper utilities: `src/utils/cycles.ts` (new)

```ts
export interface ScopeWindow {
  start: string;                        // ISO date, inclusive
  end: string;                          // ISO date, inclusive
}

export interface PeriodCycle {
  start: string;                        // ISO date, inclusive
  end: string;                          // ISO date, inclusive
  label: string;                        // "Q1 2026", "4月", "2026年", "2025年度"
}

export function getScopeWindow(
  mode: YearScope,
  today: Date,
  cardOpenDate: string,
): ScopeWindow;

export function getScopeCycles(
  benefit: Benefit,
  scope: ScopeWindow,
  cardOpenDate: string,
): PeriodCycle[];

export function findCycleRecord(
  benefit: Benefit,
  cycle: PeriodCycle,
): UsageRecord | undefined;
```

- `getScopeWindow` derives the scope from mode + today + cardOpenDate (including the "card-opened-mid-year" edge case for calendar mode).
- `getScopeCycles` enumerates calendar-aligned cycles that intersect the scope and pass `applicableMonths`. For monthly benefits, returns one cycle per month. For quarterly, one per calendar quarter. For annual, one per calendar year. For anniversary-reset benefits, one per anniversary year (labeled by anniversary start).
- `findCycleRecord` returns the first usage record whose `usedDate` falls within the cycle, or undefined.

### Updated utility: `src/utils/roi.ts`

`calculateCardROI(card, today)` is refactored to:
1. Compute the current anniversary window `[anniversaryStart, anniversaryEnd]` from `card.cardOpenDate` and `today`.
2. Sum `faceValueReturn` and `actualReturn` from records whose `usedDate` falls in that window.
3. `annualFee` unchanged.

No API shape change — callers continue to pass `today`. Existing Dashboard per-card rendering automatically benefits.

`calculateDashboardROI(cards, year)` — unchanged, keeps its calendar-year summation.

### New component: `src/views/shared/AggregatedBenefitCard.tsx`

Props:
```ts
interface AggregatedBenefitCardProps {
  item: BenefitDisplayItem;             // variant === "aggregated"
  onToggleUsage?: (cardId: string, benefitId: string, usedDate?: string) => void;
}
```

- Collapsed: summary line per filter (see Display logic above).
- Expanded: per-month rows. Unused rows (in 未使用 / 全部) include a check-off button that records a usage with `usedDate` set to the month's first day if the month is not the current month, otherwise today.
- Styled with existing glass-card primitives.

### Extended component: `src/views/shared/BenefitCard.tsx`

Add optional props for per-cycle rendering:

```ts
periodLabel?: string;
cycleRecord?: UsageRecord;              // if set, show this record's values instead of current-period
cycleUsed?: boolean;                    // controls "used" vs "待使用" visual state
```

When `periodLabel` is absent, behavior is unchanged (backward compatible).

### New component: `src/views/shared/BenefitFilterBar.tsx`

```ts
interface BenefitFilterBarProps {
  filter: FilterMode;
  onChange: (filter: FilterMode) => void;
  scope: YearScope;
  onScopeChange: (scope: YearScope) => void;
}
```

- Renders 5 pills (`可使用 / 未使用 / 已使用 / 已隐藏 / 全部`).
- Renders a 2-state toggle (`年终 / 周年`) adjacent to the pills, shown only when `filter === "unused" || filter === "all"`.
- Reused by both `CardDetail` and `ByCardView`.

### Integration

**`src/views/main/CardDetail.tsx`:**
- Replace inline `FILTERS` array and `filterBenefit` with `<BenefitFilterBar filter onChange scope onScopeChange />`.
- Add local state `scope: YearScope` (default `"calendar"`).
- Call `expandBenefitsForFilter(card, filter, today, scope)` and map items to `BenefitCard` / `AggregatedBenefitCard` based on `item.variant`.

**`src/views/tray/ByCardView.tsx`:**
- Add local state `filter: FilterMode` (default `"available"` — preserves current behavior) and `scope: YearScope` (default `"calendar"`).
- Add `<BenefitFilterBar />` above the card list.
- For each enabled card, call `expandBenefitsForFilter(card, filter, today, scope)`.
- Hide a card group when its expanded items length is 0.
- Remove the hardcoded `!b.isHidden && isApplicableNow(b, today)` filter.

### State

- Filter + scope state are local to each view (not persisted, not in store).
- Aggregated card collapse/expand state is local to the card component instance.

## Testing

Following the project's test discipline (unit tests colocated, integration in `tests/`):

**Unit tests:**
- `src/utils/cycles.test.ts`
  - `getScopeWindow` for both modes, card-opened-mid-year edge case
  - `getScopeCycles` for every reset type × every calendar period
  - `applicableMonths` filtering (airline April–Oct example)
  - anniversary cycle labeling (card opened mid-year)
  - `every_4_years` block boundary
  - `findCycleRecord` match / no-match
- `src/utils/benefitDisplay.test.ts`
  - `expandBenefitsForFilter` full matrix: 5 filters × every reset type × both scopes
  - aggregated card month lists and counts correct
  - per-cycle items have stable keys
  - hidden visibility rules (shown only in 已隐藏 / 全部, excluded elsewhere)
  - 已使用 always uses calendar year regardless of `scope` argument
  - 可使用 / 已隐藏 ignore `scope` argument
- `src/utils/roi.test.ts`
  - `calculateCardROI` uses anniversary window (record before window → excluded; record inside → included; record after → excluded)
  - cross-year anniversary (card opened Sept → anniversary spans Sept–Sept)
  - unchanged: `calculateDashboardROI` calendar-year behavior
- `src/views/shared/AggregatedBenefitCard.test.tsx`
  - collapsed summary for each kind (used / unused / all)
  - expand → month rows
  - unused-row check-off triggers `onToggleUsage` with correct `usedDate`
- `src/views/shared/BenefitFilterBar.test.tsx`
  - renders 5 pills in declared order
  - pill click emits `onChange`
  - year-scope toggle visible only for 未使用 / 全部
  - scope toggle click emits `onScopeChange`

**Integration tests:**
- `src/views/main/CardDetail.test.tsx` — seed mixed-type benefits (monthly used in Jan/Mar, quarterly used in Q1, hidden, subscription). For each filter × scope, assert rendered items.
- `src/views/tray/ByCardView.test.tsx` — new file. Multiple cards. For each filter, assert per-card rendering and empty-group hiding.
- `tests/e2e-flows.test.tsx` — extend to switch filter + scope and verify.

## Edge-case decisions

1. **Partial-cycle `applicableMonths`.** When a cycle's month range partially overlaps `applicableMonths` (e.g., quarterly benefit with `applicableMonths: [4,5,6,7]` — Q3 overlaps only at July), the entire cycle is shown as a single item with the benefit's full face value. Avoids fractional values, matches existing check-off behavior.

2. **Anniversary-reset benefits inside 年终 scope.** Anniversary benefits always enumerate as one cycle per anniversary year, labeled by anniversary start (e.g., `2025年度`). If the current anniversary window spans calendar years (e.g., 2025-09-15 → 2026-09-14), 年终 mode still shows that one anniversary cycle when its range intersects the calendar year scope window.

3. **"This year" scope for 已使用.** 已使用 is always bounded by the current calendar year (Jan 1 → Dec 31 of `today.getFullYear()`), independent of the year-scope toggle. Rationale: 已使用 is a historical "what I did this calendar year" retrospective; users toggled into anniversary mode are looking forward (planning unused), not back.

4. **Card opened mid-calendar-year in 年终 mode.** Cycles whose range ends before `cardOpenDate` are excluded from enumeration. Q1 for a card opened 2026-03-15 does not appear even though the Q1 range overlaps 2026 — the card was not held during Q1, so there's nothing to use or miss.

5. **`calculateCardROI` for a brand-new card (first anniversary year in progress).** The anniversary window is still `[cardOpenDate, cardOpenDate + 1 year - 1 day]`, which is fully in the future except for the current-year-to-date portion. ROI sums whatever records exist in that window, which may be zero for a freshly-opened card. No clamping.

## Migration / backward compatibility

- No persisted data changes.
- `BenefitCard` API gains optional props; existing call sites continue to work.
- `ByCardView`'s hardcoded filter is replaced — tests asserting the old "applicable now, not hidden" default are updated to default filter `"available"` (which produces the same visible set).
- `CardDetail`'s `data-testid="filter-pills"` remains; individual pill testids change (e.g., `filter-pill-available`). Integration tests are updated.
- `calculateCardROI`'s observable output changes (year window shift from "calendar year containing today" to "anniversary year containing today"). Tests covering ROI are updated; any card whose test data spans multiple years needs reviewed fixtures.

## Rollout

One merge, split into focused commits:
1. Cycles + scope utility (`src/utils/cycles.ts` + tests).
2. `benefitDisplay.ts` expansion logic + tests.
3. `calculateCardROI` anniversary refactor + test updates.
4. `BenefitFilterBar`, `AggregatedBenefitCard`, `BenefitCard` prop extension + tests.
5. Integration: `CardDetail` + `ByCardView` wiring + integration-test updates.

All tests pass before merge. No feature flag — direct visual upgrade.
