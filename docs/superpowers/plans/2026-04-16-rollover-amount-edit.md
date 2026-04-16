# Rollover Amount Edit on Existing Cards — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users view and edit a rollover benefit's accumulated amount on an already-created card, using a dedicated dialog launched from the BenefitCard row, and replace the ambiguous `isRollover` flag on `UsageRecord` with a first-class `kind` discriminator.

**Architecture:** A pure-function `generateRolloverRecords` already converts "accumulated amount" into N `kind: "rollover"` records. The new `RolloverEditDialog` wraps that function behind an atomic store action (`replaceRolloverRecords`) that deletes prior rollover records and emits a fresh set. Readers (`findCycleRecord`, `isBenefitUsedInPeriod`, `getAvailableValue`) are updated to branch on `record.kind`. A one-shot migration inside `migrateCards` converts legacy `isRollover: true` records, snaps their `usedDate` to the containing cycle start, dedupes duplicates, and deletes the legacy field.

**Tech Stack:** TypeScript, React 19, Zustand, Vitest + React Testing Library.

**Spec:** `docs/superpowers/specs/backlog-rollover-amount-edit.md`

---

## 1. Problem Statement

After initial card creation there is no UI to revisit rollover amounts — `BackfillDialog` only fires once from `MainWindow.tsx:101` on new cards. The existing `↗` button on `BenefitCard` (lines 215–224) writes a zero-value record via `useCardStore.rolloverBenefit` (`src/stores/useCardStore.ts:214-235`), which conflicts with the multi-record output of `generateRolloverRecords` (`src/utils/rollover.ts:65-89`): both use the same `isRollover: true` marker but place `usedDate` in *different* cycles (today vs. previous period start). As a consequence, `findCycleRecord` (`src/utils/cycles.ts:200-206`) and `isBenefitUsedInPeriod` (`src/utils/period.ts:179-212`) can't tell a rollover record apart from a true usage record, so a current-cycle rollover marker surfaces as "already used". We need both a first-class editing UI and a clean discriminator before building more rollover surfaces on top.

---

## 2. UI Approach

**Decision: the existing `↗` button on `BenefitCard` is rewired to open the new `RolloverEditDialog` pre-filled with the current accumulated rollover amount.** No new `⚙` gear button is added — one entry point per rolloverable benefit row keeps the card visually clean and avoids splitting semantics across two controls. The spec's three candidates were: (1) repurpose `BackfillDialog`'s rollover step from a CardDetail entry point, (2) turn the `↗` button into an input prompt, (3) a full `BenefitDetail` page. Option 1 couples rollover editing to a multi-step card-onboarding flow we don't want to reopen. A bare `↗` prompt (option 2) can't show the `rolloverMaxYears` cap or a live preview. Option 3 is disproportionate for a single field. A dedicated dialog reuses `generateRolloverRecords`, reuses the input control shape from `BackfillDialog.tsx:229-238`, and gives room to show the max-years constraint and the derived record preview inline.

### Pre-fill behaviour

When the dialog opens, the amount input is seeded from the current rollover state:
`prefillAmount = (count of kind === "rollover" records) × benefit.faceValue`.
Result: clicking `↗` on a benefit with no existing rollover shows an empty-state `0`; clicking on one already showing accumulated `$600` at `$300/year` seeds `600` and previews the two existing records.

### Max-years reduction behaviour

When the user types a lower amount (or when `benefit.rolloverMaxYears` has been reduced via the benefit editor), the preview regenerates via `generateRolloverRecords(benefit, newAmount, today)`, which already clamps to `rolloverMaxYears * PERIOD_MULTIPLIER[period]`. On save, `replaceRolloverRecords` atomically drops all prior `kind === "rollover"` records and appends the new set — **oldest over-cap records are silently pruned, no confirm prompt**. This is an explicit decision (see §7 Decisions).

### ASCII Mockup

```
┌──────────────────────────────────────────────┐
│  Rollover — $300 Airline Fee Credit          │
├──────────────────────────────────────────────┤
│  FaceValue:    $300 / cycle                  │
│  Max rollover: 2 years (= 2 cycles annual)   │
│                                              │
│  Accumulated rollover amount: $ [   600   ]  │
│                                              │
│  Preview (auto-generated records):           │
│    • 2025-01-01  rollover  $0 (faceValue $0) │
│    • 2024-01-01  rollover  $0 (faceValue $0) │
│  Effective available this cycle: $900        │
│                                              │
│  [ Clear rollover ]   [ Cancel ]   [ Save ]  │
└──────────────────────────────────────────────┘
```

The `↗` button remains on rolloverable `BenefitCard` rows (in `CardDetail` — tray views will continue to not pass `onEditRollover`) but its `onClick` now opens this dialog rather than writing a zero-value record. The old one-click "mark current cycle rolled" shortcut is subsumed: typing `faceValue` into the amount field and saving produces the equivalent single-record state, and doing so goes through the same validated code path as multi-year input.

---

## 3. Data Model Changes

Replace the ambiguous optional `isRollover` boolean on `UsageRecord` with a first-class required `kind` discriminator. Legacy data is upgraded at load time by the migration (§4), so nothing in runtime code reads `isRollover`.

### Before (`src/models/types.ts:69-77`)

```ts
export interface UsageRecord {
  usedDate: string;
  faceValue: number;
  actualValue: number;
  isRollover?: boolean;
  propagateNext?: boolean;
}
```

### After

```ts
export type UsageRecordKind = "usage" | "rollover";

export interface UsageRecord {
  usedDate: string;
  faceValue: number;
  actualValue: number;
  kind: UsageRecordKind;
  propagateNext?: boolean;
}
```

### Invariants (enforced in writers + asserted in tests)

- `kind === "rollover"` ⇒ `faceValue === 0` and `actualValue === 0`.
- `kind === "rollover"` ⇒ `usedDate` equals the `start` of the containing cycle as produced by `getPeriodRangeAt(date, period)`.
- Per benefit, at most one `kind === "rollover"` record per cycle (duplicate-guard at write time and in migration).
- `kind === "usage"` records preserve all existing semantics (including `propagateNext`).

---

## 4. Migration

Extend `migrateCards` in `src/utils/migrations.ts` (mirror the `migrateAutoRecur` style, idempotent, one record at a time). Add a helper `migrateRolloverKind(benefit)`:

1. For every `usageRecord` on every benefit:
   - If `record.kind` is already set, leave it alone (idempotent short-circuit for already-migrated data).
   - If `record.isRollover === true` (legacy input shape), produce a new record with `kind: "rollover"`, force `faceValue = 0` and `actualValue = 0`, snap `usedDate` to `getPeriodRangeAt(new Date(usedDate), benefit.resetConfig.period).start`, and **delete the `isRollover` property** (uses the same `omitKey` helper as `migrateAutoRecur`). Skip the snap when `benefit.resetConfig.period` is undefined (non-calendar benefit — log a warn; such records should not exist but may be present in old test fixtures).
   - Otherwise (legacy usage record), produce a new record with `kind: "usage"`, preserve `usedDate` and values, delete any orphan `isRollover: false` property.
2. After the per-record pass, dedupe rollover records per cycle: group by `usedDate` within `kind === "rollover"` records, keep the oldest `usedDate` occurrence, drop the rest (log `debug`).
3. Legacy `isRollover` is deleted from every record as a side effect of the mapping in step 1 — no shadow field remains in live data.

Migration runs inside `migrateCards` alongside `migrateAutoRecur` so it executes on every load and is a no-op once data is converted.

---

## 5. Implementation Steps

Each task is a single commit under 500 LOC of non-test changes, tests-first (see `CLAUDE.md` testing rules). Use `superpowers:test-driven-development` per step.

### Task 1 — `UsageRecord.kind` type + constructor helpers

**Files:**
- Modify: `src/models/types.ts` (remove `isRollover`, add `UsageRecordKind` and required `kind` field)
- Modify: `src/utils/usageRecords.ts` (add `makeUsageRecord()` and `makeRolloverRecord()` factories that enforce invariants)
- Modify: `src/utils/usageRecords.test.ts`

**Tests (Layer 1):**
- `makeRolloverRecord` rejects non-zero face/actual value.
- `makeRolloverRecord` snaps `usedDate` to period start.
- `makeUsageRecord` preserves input `usedDate`, rejects `kind` mismatch.
- Type-level: removing `isRollover` is a compile break for any caller still reading it — fixed downstream in Task 3/4.

### Task 2 — Migration: backfill `kind`, snap dates, dedupe, strip legacy field

**Files:**
- Modify: `src/utils/migrations.ts` (add `migrateRolloverKind`)
- Modify: `src/utils/migrations.test.ts`

**Tests (Layer 1):**
- Legacy `{ isRollover: true, usedDate: "2025-03-14" }` → `{ kind: "rollover", usedDate: <cycle start> }` with `isRollover` property deleted.
- Legacy usage record → `{ kind: "usage", ...rest }`, `usedDate` untouched, `isRollover: false` stripped if present.
- Two legacy rollover records in the same cycle → collapsed to one.
- Idempotency: running migration twice yields identical output and property set.
- Already-tagged record (`kind` present) is not mutated.

### Task 3 — Read-side consumers branch on `kind`

**Files:**
- Modify: `src/utils/cycles.ts` — `findCycleRecord` gains an option `{ includeRollover?: boolean }` defaulting to `false`; existing callers opt in only where they need the rollover row.
- Modify: `src/utils/period.ts` — `isBenefitUsedInPeriod` filters out `kind === "rollover"` records when checking cycle membership.
- Modify: `src/utils/rollover.ts` — `getAvailableValue` reads `record.kind === "rollover"` instead of `record.isRollover`.

**Tests (Layer 1):**
- `isBenefitUsedInPeriod` returns false when the only record in the current cycle is a rollover record (regression test for the bug called out in the spec).
- `findCycleRecord` returns undefined on rollover record by default, returns the record when `includeRollover` is true.
- `getAvailableValue` still accumulates correctly when driven by `kind`.

### Task 4 — Writers emit `kind`

**Files:**
- Modify: `src/stores/useCardStore.ts` — `rolloverBenefit` is deprecated in favour of dialog-driven writes (kept for back-compat during the same commit window, but it now writes `kind: "rollover"`, snaps `usedDate` to current period start, and refuses to create a duplicate in the same cycle — silent no-op, debug log).
- Modify: `src/utils/rollover.ts` — `generateRolloverRecords` emits `kind: "rollover"` (no `isRollover` field anywhere).
- Modify: `src/views/main/BackfillDialog.tsx` — no behavior change; add a test asserting emitted records carry `kind`.

**Tests (Layer 2 — store integration):**
- `rolloverBenefit` twice in the same cycle → only one record.
- Record created by `rolloverBenefit` has `kind: "rollover"`, `faceValue: 0`, `actualValue: 0`, `usedDate` aligned to cycle start.

### Task 5 — Store actions for the dialog

**Files:**
- Modify: `src/stores/useCardStore.ts` — add:
  - `replaceRolloverRecords(cardId, benefitId, rolloverAmount)` — atomically drops all existing `kind === "rollover"` records on that benefit, then appends the output of `generateRolloverRecords(benefit, rolloverAmount, today)`. Natural consequence: when `rolloverAmount` implies fewer cycles than currently stored, oldest records are pruned by virtue of regeneration.
  - `clearRolloverRecords(cardId, benefitId)` — drops all `kind === "rollover"` records.
- Modify: `src/stores/useCardStore.test.ts`

**Tests (Layer 2):**
- `replaceRolloverRecords` is idempotent on identical amount.
- `replaceRolloverRecords` clamps to `rolloverMaxYears * PERIOD_MULTIPLIER[period]`.
- Reducing the amount removes oldest rollover records (regression for the max-years prune decision).
- Reducing `rolloverMaxYears` below existing rollover-record count and then calling `replaceRolloverRecords` with the prior amount silently prunes records beyond the new cap (no error, no confirm).
- `clearRolloverRecords` leaves non-rollover records intact.

### Task 6 — `RolloverEditDialog` component

**Files:**
- Create: `src/views/main/RolloverEditDialog.tsx` (portal dialog; amount input + live preview list + Save / Clear / Cancel)
- Create: `src/views/main/RolloverEditDialog.test.tsx`
- Create: `src/views/main/RolloverEditDialog.css`

**Tests (Layer 3):**
- Opens with amount seeded from `(rollover record count × faceValue)`.
- Preview list updates when amount changes.
- Save invokes `replaceRolloverRecords` with the typed amount.
- Cancel closes without dispatching.
- Clear invokes `clearRolloverRecords`.
- Amount above `rolloverMaxYears * faceValue * periodsPerYear` is capped in the preview (delegates to `generateRolloverRecords`).
- Lowering implicit years via amount reduction → preview shrinks, save prunes; dialog never prompts.
- **Non-rolloverable guard:** the component contract requires `benefit.rolloverable === true`. Mechanism: in development (`import.meta.env.DEV`) the component asserts on mount and throws to fail tests loudly; in production it logs a `warn` via `createLogger("views.rollover-dialog")` and renders `null`. Test covers both branches by toggling `import.meta.env.DEV`.

### Task 7 — Entry point: `↗` button rewired in `CardDetail`

**Files:**
- Modify: `src/views/shared/BenefitCard.tsx` — add optional `onEditRollover?: (cardId, benefitId) => void` prop; when supplied, the existing `↗` button's `onClick` calls it instead of `onRollover`. The `↗` button remains visually identical. Tray views (which do not pass `onEditRollover`) fall back to the legacy `onRollover` path until they are retired.
- Modify: `src/views/main/CardDetail.tsx` — owns dialog open state and wires `onEditRollover`; removes the direct `rolloverBenefit` prop passthrough for the main view.
- Modify: `src/views/shared/BenefitCard.test.tsx` — click on `↗` invokes the new handler when supplied.

**Tests (Layer 3):**
- In `CardDetail`, clicking `↗` opens the dialog pre-filled with current accumulated amount.
- In tray `ByUrgencyView`, `↗` still marks the cycle as rolled (no regression) because `onEditRollover` is not supplied.
- Dialog close returns focus to the `↗` button (keyboard-navigable).

### Task 8 — Docs

**Files:**
- Modify: `docs/dev/modules/rollover.md` (or create if missing) — document `kind` discriminator, invariants, writer/reader contracts, and the `↗`-opens-dialog entry point.
- Modify: `docs/dev/architecture.md` — add `RolloverEditDialog` to the main-view module map.
- Modify: `docs/superpowers/specs/backlog-rollover-amount-edit.md` — mark as shipped; link to this plan.

No tests.

---

## 6. Test Plan

### Layer 1 — Pure logic (`src/utils/*.test.ts`)

- Migration: legacy `isRollover: true` → `kind: "rollover"` with the `isRollover` property deleted; date snapping per period (monthly / quarterly / semi_annual / annual / every_4_years); idempotency; dedupe.
- `generateRolloverRecords`: every output record has `kind: "rollover"`, no `isRollover` field, `usedDate` aligns to period start, max-years clamp respected.
- `isBenefitUsedInPeriod`: rollover-only current cycle → false (regression).
- `getAvailableValue`: driven by `kind` not `isRollover`.
- Factory invariants: face/actual must be 0 for rollover; date snapped; `kind` mandatory.

### Layer 2 — Store integration (`src/stores/useCardStore.test.ts`, `tests/store-integration.test.ts`)

- `replaceRolloverRecords` sequence: start empty → set 600 → set 300 → clear. Assert record count and `kind` at each step.
- **Max-years prune:** benefit with 3 rollover records and `rolloverMaxYears: 3`; reduce to `rolloverMaxYears: 1`; call `replaceRolloverRecords` with amount matching the old count; assert only 1 record remains (oldest pruned), no error.
- `rolloverBenefit` called twice in the same cycle → single record (duplicate-guard).
- JSON round-trip with a rollover record: save, load, migration no-ops, equality holds; no `isRollover` field anywhere in serialised output.

### Layer 3 — Component (`src/views/main/RolloverEditDialog.test.tsx`, `src/views/shared/BenefitCard.test.tsx`)

- Dialog preview updates live as user types amount.
- Dialog opens pre-filled when existing rollover records exist; empty otherwise.
- Save button dispatches with typed amount and closes dialog.
- Clear button dispatches `clearRolloverRecords` and closes dialog.
- Cancel closes without dispatching.
- Lowering amount past existing record count → preview shrinks, save prunes silently (no confirm rendered).
- Non-rolloverable guard: in DEV, rendering the dialog with a non-rolloverable benefit throws on mount; in prod, it logs warn and renders null. Both assertions run via `vi.stubEnv`.
- `↗` entry point: in `CardDetail` opens the dialog; in `ByUrgencyView` still calls legacy `onRollover`.

---

## 7. Decisions (previously open questions)

1. **`↗` quick button:** its `onClick` now opens `RolloverEditDialog` pre-filled with the current accumulated amount. No separate `⚙` gear is added — one entry point per rolloverable row.
2. **Legacy `isRollover`:** deleted immediately. `UsageRecord.kind` is the only discriminator in live code; the migration strips `isRollover` from any legacy record it touches. No deprecation window.
3. **`rolloverMaxYears` reduction:** oldest over-cap rollover records are silently pruned on the next `replaceRolloverRecords` save. No confirm prompt.

## 8. Open Questions

None at the time of writing. New questions that arise during implementation should be surfaced before the relevant task commits.
