# Rollover Module

## Overview

Rollover lets a benefit's unused cycle quota accumulate into the current cycle's available value. This module defines the `UsageRecord.kind` discriminator, the `generateRolloverRecords` + `getAvailableValue` pure helpers, and the two store actions + UI entry points that write rollover records.

## Data Model

```ts
export type UsageRecordKind = "usage" | "rollover";

export interface UsageRecord {
  usedDate: string;      // ISO date, snapped to cycle start for kind === "rollover"
  faceValue: number;     // 0 for rollover
  actualValue: number;   // 0 for rollover
  kind: UsageRecordKind;
  propagateNext?: boolean; // usage records only (subscription auto-recur)
}
```

### Invariants (enforced at write time; asserted in tests)

- `kind === "rollover"` ⇒ `faceValue === 0` and `actualValue === 0`.
- `kind === "rollover"` ⇒ `usedDate` is the `start` of the containing cycle (produced by `getPeriodRangeAt` via `cycleStartForDate`).
- At most one `kind === "rollover"` record per benefit per cycle (duplicate-guard in writers; deduped on migration).
- `kind === "usage"` preserves all prior semantics including `propagateNext`.

Use `makeRolloverRecord(cycleStart)` and `makeUsageRecord({ ... })` from `src/utils/usageRecords.ts` — these are the only sanctioned constructors.

## Writer Contracts

| Action | Location | Cycle it targets | Intent |
|--------|----------|-----------------|--------|
| `rolloverBenefit(cardId, benefitId)` | `src/stores/useCardStore.ts` | current cycle (snapped) | "mark this cycle rolled forward" — invoked by the `⟳` per-cycle shortcut on `BenefitCard`. Silent no-op on duplicate. |
| `replaceRolloverRecords(cardId, benefitId, amount)` | `src/stores/useCardStore.ts` | past cycles only | Past-balance editor: drops past-cycle rollovers, regenerates from `generateRolloverRecords(benefit, amount, today)`, preserves current-cycle rollover and all usage records. |
| `clearRolloverRecords(cardId, benefitId)` | `src/stores/useCardStore.ts` | past cycles only | Drops past-cycle rollovers; preserves current-cycle rollover and usage. |
| `generateRolloverRecords(benefit, amount, today)` | `src/utils/rollover.ts` | past cycles | Pure: returns up to `rolloverMaxYears × PERIOD_MULTIPLIER[period]` past-cycle rollover records, walking backward from the current cycle. |

`rolloverMaxYears` reductions are handled implicitly — the next `replaceRolloverRecords` call regenerates under the new cap, silently pruning records beyond it. No confirm dialog.

## Reader Contracts

| Reader | Behavior |
|--------|----------|
| `findCycleRecord(benefit, cycle, { includeRollover? })` | Defaults to `includeRollover: false` — ignores rollover markers so "is this cycle consumed?" queries aren't polluted. Pass `true` when iterating over all records in a cycle. |
| `isBenefitUsedInPeriod(benefit, today, ...)` | Filters rollover records out before the usage check. A current-cycle rollover never surfaces as "already used". |
| `getAvailableValue(benefit, today)` | Walks past cycles backward; each consecutive past cycle carrying a rollover record (and *only* a rollover record) adds one `faceValue` to the available total. Breaks on the first cycle with a usage record or no record. |

## UI Entry Points

Only `CardDetail` wires the past-balance editor; tray views don't render the gear.

- **`⟳` per-cycle shortcut** (`BenefitCard.tsx`): visible on unused rolloverable benefits. Unicode U+27F3, 1.35× button font-size, `font-weight: 700`. Fires `onRollover(cardId, benefitId)` → `rolloverBenefit`.
- **`⚙` gear button** (`BenefitCard.tsx`): renders only when `onEditRollover` is supplied **and** the benefit is rolloverable. Fires `onEditRollover(cardId, benefitId)` → `CardDetail` opens `RolloverEditDialog`.
- **`RolloverEditDialog`** (`views/main/RolloverEditDialog.tsx`): past-balance editor. Amount input seeded from `(past-cycle rollover count × faceValue)`. Live preview via `generateRolloverRecords`. Buttons: Clear → `clearRolloverRecords`, Cancel → close, Save → `replaceRolloverRecords`. Non-rolloverable / no-period benefits: throws in DEV, logs warn + renders `null` in prod.

## Migration

`migrateRolloverKind` (in `src/utils/migrations.ts`) runs inside `migrateCards` on every load. It:

1. Skips records that already have `kind` set (idempotent).
2. Converts `{ isRollover: true }` to `{ kind: "rollover" }`, snaps `usedDate` to the containing cycle start (using the benefit's `resetConfig.period`), zeroes face/actual.
3. Tags everything else as `{ kind: "usage" }`.
4. Strips the legacy `isRollover` property from every record.
5. Dedupes rollover records per cycle (keeps the first occurrence).

No live code reads `isRollover` — it exists only in the `LegacyRecord` type inside `migrations.ts`.
