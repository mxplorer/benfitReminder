# Rollover Amount Edit on Existing Cards — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users view and edit a rollover benefit's accumulated amount on an already-created card, using a dedicated dialog launched from the BenefitCard row, while making the underlying `UsageRecord` discriminator unambiguous.

**Spec:** `docs/superpowers/specs/backlog-rollover-amount-edit.md`

---

## 1. Problem Statement

After initial card creation there is no UI to revisit rollover amounts — `BackfillDialog` only fires once from `MainWindow.tsx:101` on new cards. The existing `↗` button on `BenefitCard` (lines 215–224) writes a zero-value record via `useCardStore.rolloverBenefit` (`src/stores/useCardStore.ts:214-235`), which conflicts with the multi-record output of `generateRolloverRecords` (`src/utils/rollover.ts:65-89`): both use the same `isRollover: true` marker but place `usedDate` in *different* cycles (today vs. previous period start). As a consequence, `findCycleRecord` (`src/utils/cycles.ts:200-206`) and `isBenefitUsedInPeriod` (`src/utils/period.ts:179-212`) can't tell a rollover record apart from a true usage record, so a current-cycle rollover marker surfaces as "already used". We need both a first-class editing UI and a clean discriminator before building more rollover surfaces on top.

---

## 2. UI Approach — Recommendation

**Recommended: Dedicated `RolloverEditDialog` launched from a `⚙` button next to `↗` on rolloverable `BenefitCard` rows in the main desktop view.** The spec lists three candidates:

1. Reuse `BackfillDialog`'s rollover step from a CardDetail entry point.
2. Turn the `↗` button into a prompt.
3. A full `BenefitDetail` page.

Option 2 forces a modal mindset on what is today a one-click shortcut, and a bare prompt cannot show `rolloverMaxYears` caps or a live record preview. Option 3 is disproportionate — rollover is the only property worth editing per-benefit right now. Option 1 couples rollover editing to a multi-step card-onboarding flow we don't want to reopen. A standalone dialog reuses `generateRolloverRecords` and the existing input control from `BackfillDialog.tsx:229-238`, keeps the `↗` quick-action intact, and gives us room to show the max-years constraint and the derived record list inline.

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

`BenefitCard` gains a `⚙` button only when `benefit.rolloverable === true`; clicking it opens the dialog. The `↗` quick button continues to mark the current cycle as rolled (see open question 1 for its long-term fate).

---

## 3. Data Model Changes

Add an unambiguous discriminator `kind` to `UsageRecord` so rollover records are first-class, and keep the legacy `isRollover` for one release to ease rollout.

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
  /** @deprecated Use `kind === "rollover"`. Removed in the release after
   *  2026-04-16-rollover-amount-edit ships. Retained one release for
   *  JSON-file compatibility; migrations fill `kind` from it. */
  isRollover?: boolean;
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
   - If `record.kind` is already set, leave it alone (idempotent short-circuit).
   - If `record.isRollover === true`, set `kind = "rollover"`, force `faceValue = 0`, `actualValue = 0`, and snap `usedDate` to `getPeriodRangeAt(new Date(usedDate), benefit.resetConfig.period).start`. Skip the snap when `benefit.resetConfig.period` is undefined (non-calendar benefit — log a warn; such records should not exist but may be present in old test fixtures).
   - Otherwise, set `kind = "usage"`.
2. After the per-record pass, dedupe rollover records per cycle: group by `usedDate` within rollover records, keep the oldest `usedDate` occurrence, drop the rest (log a `debug`).
3. Leave the legacy `isRollover` boolean in place — downstream code reads `kind`, migration keeps both until the field is dropped in a follow-up release.

Migration runs inside `migrateCards` alongside `migrateAutoRecur` so it executes on every load and is a no-op once data is converted.

---

## 5. Implementation Steps

Each task is a single commit under 500 LOC of non-test changes, tests-first (see `CLAUDE.md` testing rules). Use `superpowers:test-driven-development` per step.

### Task 1 — `UsageRecord.kind` type + constructor helpers

**Files:**
- Modify: `src/models/types.ts` (add `UsageRecordKind`, `kind` field, deprecation comment on `isRollover`)
- Create: `src/utils/usageRecords.ts` additions — `makeUsageRecord()`, `makeRolloverRecord()` factories that enforce invariants.
- Modify: `src/utils/usageRecords.test.ts` (factory unit tests)

**Tests (Layer 1):**
- Rollover factory rejects non-zero face/actual value.
- Rollover factory snaps `usedDate` to period start.
- Usage factory preserves input `usedDate`, rejects `kind` mismatch.

### Task 2 — Migration: backfill `kind`, snap dates, dedupe

**Files:**
- Modify: `src/utils/migrations.ts` (add `migrateRolloverKind`)
- Modify: `src/utils/migrations.test.ts`

**Tests (Layer 1):**
- Legacy `isRollover: true` → `kind: "rollover"` + `usedDate` snapped to cycle start.
- Legacy usage record → `kind: "usage"`, `usedDate` untouched.
- Two legacy rollover records in the same cycle → collapsed to one.
- Idempotency: running migration twice yields identical output.
- Record already tagged with `kind` is not mutated.

### Task 3 — Read-side consumers stop treating rollover as usage

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
- Modify: `src/stores/useCardStore.ts` — `rolloverBenefit` writes `kind: "rollover"`, snaps `usedDate` to current period start, and refuses to create a duplicate in the same cycle (silent no-op, returns state unchanged with a debug log).
- Modify: `src/utils/rollover.ts` — `generateRolloverRecords` emits `kind: "rollover"` alongside `isRollover: true` for the deprecation window.
- Modify: `src/views/main/BackfillDialog.tsx` — no behavior change, pass records through unchanged; add test that emitted records have `kind`.

**Tests (Layer 2 — store integration):**
- `rolloverBenefit` twice in the same cycle → only one record.
- Record created by `rolloverBenefit` has `kind: "rollover"`, `faceValue: 0`, `actualValue: 0`, `usedDate` aligned to cycle start.

### Task 5 — Store actions for the dialog

**Files:**
- Modify: `src/stores/useCardStore.ts` — add:
  - `replaceRolloverRecords(cardId, benefitId, rolloverAmount)` — atomically drop all existing `kind === "rollover"` records on that benefit, then append the output of `generateRolloverRecords(benefit, rolloverAmount, today)`.
  - `clearRolloverRecords(cardId, benefitId)` — drop all `kind === "rollover"` records.
- Modify: `src/stores/useCardStore.test.ts`

**Tests (Layer 2):**
- `replaceRolloverRecords` is idempotent on identical amount.
- `replaceRolloverRecords` clamps to `rolloverMaxYears * PERIOD_MULTIPLIER[period]` (delegated to `generateRolloverRecords`).
- Reducing the amount removes oldest rollover records first (implicit via regeneration).
- `clearRolloverRecords` leaves non-rollover records intact.

### Task 6 — `RolloverEditDialog` component

**Files:**
- Create: `src/views/main/RolloverEditDialog.tsx` (portal dialog; amount input + live preview list + Save / Clear / Cancel)
- Create: `src/views/main/RolloverEditDialog.test.tsx`
- Create: `src/views/main/RolloverEditDialog.css`

**Tests (Layer 3):**
- Preview list updates when amount changes.
- Save invokes `replaceRolloverRecords` with the typed amount.
- Cancel closes without dispatching.
- Clear invokes `clearRolloverRecords`.
- Amount above `rolloverMaxYears * faceValue * periodsPerYear` is capped in the preview (delegates to `generateRolloverRecords`).
- Non-rolloverable benefit rendering is blocked by an invariant check (dev warning, renders nothing).

### Task 7 — Entry point in `CardDetail` / `BenefitCard`

**Files:**
- Modify: `src/views/shared/BenefitCard.tsx` — add optional `onEditRollover?: (cardId, benefitId) => void` prop; render `⚙` action button only when `benefit.rolloverable` and the handler is supplied.
- Modify: `src/views/main/CardDetail.tsx` — wire the new handler; own dialog open state.
- Modify: `src/views/shared/BenefitCard.test.tsx` — button appears only for rolloverable benefits, clicking it calls the handler.

**Tests (Layer 3):**
- `⚙` button only visible on rolloverable benefits.
- Click opens dialog with correct pre-filled amount (sum of existing rollover records × faceValue).
- Tray-view `BenefitCard` (`ByUrgencyView.tsx`) is unchanged because it does not pass `onEditRollover` — explicit test that the gear is absent there.

### Task 8 — Docs

**Files:**
- Modify: `docs/dev/modules/rollover.md` (or create if missing) — document `kind` discriminator, invariants, writer/reader contracts, deprecation schedule for `isRollover`.
- Modify: `docs/dev/architecture.md` — add `RolloverEditDialog` to the main-view module map.
- Modify: `docs/superpowers/specs/backlog-rollover-amount-edit.md` — mark as shipped; link to this plan.

No tests.

---

## 6. Test Plan

### Layer 1 — Pure logic (`src/utils/*.test.ts`)

- Migration: legacy → `kind` mapping, date snapping per period (monthly / quarterly / semi_annual / annual / every_4_years), idempotency, dedupe.
- `generateRolloverRecords`: every output record has `kind: "rollover"`, `usedDate` aligns to period start, max-years clamp respected.
- `isBenefitUsedInPeriod`: rollover-only current cycle → false (regression).
- `getAvailableValue`: driven by `kind` not `isRollover`.
- Factory invariants: face/actual must be 0 for rollover; date snapped; `kind` mandatory.

### Layer 2 — Store integration (`src/stores/useCardStore.test.ts`, `tests/store-integration.test.ts`)

- `replaceRolloverRecords` sequence: start empty → set 600 → set 300 → clear. Assert record count and `kind` at each step.
- `rolloverBenefit` called twice in the same cycle → single record (duplicate-guard).
- JSON round-trip with a rollover record: save, load, migration no-ops, equality holds.
- Reducing `rolloverMaxYears` below existing rollover count: test the chosen behavior (see open question 3) — either oldest pruned on next `replaceRolloverRecords`, or a flag surfaced for the UI to prompt.

### Layer 3 — Component (`src/views/main/RolloverEditDialog.test.tsx`, `src/views/shared/BenefitCard.test.tsx`)

- Dialog preview updates live as user types amount / hypothetical max-years change.
- Save button dispatches with typed amount and closes dialog.
- Clear button dispatches `clearRolloverRecords` and closes dialog.
- Cancel closes without dispatching.
- Gear button visibility scoped to rolloverable benefits in `CardDetail` only, not in tray views.

---

## 7. Open Questions

1. **`↗` quick button fate.** Keep as-is (one-click "rollover current cycle" marker alongside the new `⚙` dialog), remove it now that the dialog can do more, or change it to open the dialog pre-filled with `faceValue` as a shortcut? Current plan keeps it untouched; confirm.

2. **Deprecation policy for legacy `isRollover`.** Options: (a) keep both fields for exactly one release, then drop `isRollover` and remove the deprecation comment; (b) drop `isRollover` immediately and rely entirely on migration; (c) keep indefinitely. Current plan is (a). Confirm the target release / tag to drop it.

3. **`rolloverMaxYears` reduction handling.** When the user lowers `rolloverMaxYears` via the benefit editor and the existing rollover-record count exceeds the new cap, do we silently prune oldest records at the next `replaceRolloverRecords`/save, prompt the user with a confirm, or leave the over-cap records alone until the user opens the dialog? Current plan is silent prune on save inside `replaceRolloverRecords` (natural consequence of regenerating from amount) — but an explicit prompt may be safer. Confirm.
