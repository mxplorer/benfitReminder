# Per-Record Propagation for Monthly Subscription Benefits

## Goal

Move the "auto-replicate next month" decision from a benefit-level flag
(`Benefit.autoRecur`) to a per-usage-record flag
(`UsageRecord.propagateNext`). Every month becomes an independent decision
the user makes when recording usage, instead of a set-once setting.

## Motivation

Today's model has two problems:

1. **Discoverability.** The `autoRecur` checkbox lives in the BenefitEditor.
   Users who enter usage directly from the benefit card never see it.
2. **Rigidity.** Once set, the only way to stop propagation is to go back
   into the editor. Users expect to decide at the moment of use.

The new model surfaces the choice inline in the usage prompt and lets each
month stand on its own.

## Data Model Changes

### `UsageRecord` — new optional field

```ts
export interface UsageRecord {
  usedDate: string;
  faceValue: number;
  actualValue: number;
  isRollover?: boolean;
  /** For monthly subscription benefits: if true, app auto-creates next
   * month's record carrying this record's actualValue forward. Only
   * meaningful when the benefit's resetType is "subscription" or
   * calendar+monthly. */
  propagateNext?: boolean;
}
```

### `Benefit` — fields removed

- Remove `autoRecur: boolean`.
- Remove `cancelledMonths?: string[]`.

Their roles are now carried by `propagateNext` on the latest record (or
its absence).

### `CardStoreState` — new field

```ts
interface CardStoreState {
  cards: CreditCard[];
  settings: AppSettings;
  /** Monotonic "current moment" the UI reads for all today-dependent
   * calculations. Bumped by `recalculate()`. Used so focus/midnight
   * triggers cause a re-render even when no record was generated. */
  now: Date;
}
```

## Generation Rule

For each benefit where monthly propagation applies (`resetType` is
`subscription`, or `calendar` with `period === "monthly"`):

1. Look up the record for the *previous* calendar month.
2. If that record exists AND has `propagateNext === true` AND the current
   month has no record → create a current-month record with
   `actualValue = previous.actualValue` and `propagateNext = true`.
3. Otherwise do nothing.

Key properties:

- **Chain breaks naturally on delete.** If the user unchecks (deletes) a
  record, the next generation pass has no anchor in that month → no
  regeneration.
- **Idempotent.** Running multiple times in the same calendar month yields
  the same result.
- **Skip-a-month detection.** Only looks one month back — the user must
  explicitly re-enable propagation after any gap.
- **One-shot snapshot.** Propagation copies `actualValue` at the moment
  the next record is created. Editing an older record's `actualValue`
  afterward does **not** retroactively update downstream records. This
  keeps records truly independent.
- **Only the latest prior month counts.** Editing an old record's
  `propagateNext` has no effect on generation unless that record is in
  the calendar month immediately before today.

## Trigger Points

A new store action `recalculate()`:

```ts
recalculate: () => {
  // 1. Generate missing auto-propagated records.
  // 2. Bump `now` so subscribers re-render and pick up new dates.
  set({ now: new Date() });
  get().generateAutoRecurRecords();
}
```

Called from:

- **App startup** (replaces the existing `generateAutoRecurRecords` call
  in `src/tauri/persistence.ts:122`).
- **Window focus event** — `window.addEventListener("focus", …)` in
  `MainWindow`.
- **Daily midnight timer** — `setTimeout` scheduled for the next 00:00,
  re-scheduled on each fire.

## UI Changes

### Usage prompt (`BenefitCard.tsx`)

For subscription and calendar-monthly benefits, the inline prompt gains a
checkbox between 使用日期 and the confirm button:

```
实际到手: [___]  使用日期: [___]  ☐ 自动续期下月  ✓  ✕
```

- Default checkbox state when entering value: the `propagateNext` of the
  benefit's most recent prior record, or `false` if none.
- On confirm, the created/updated record carries this flag.

### Edit-existing-record

Clicking ✓ on a already-used record currently only unchecks it. New
behavior for subscription / calendar-monthly: clicking the record opens
the same prompt pre-filled with the record's `actualValue` and
`propagateNext`, offering Edit / Delete actions.

(Non-monthly benefits keep their current behavior: ✓ click unchecks.)

### `BenefitEditor.tsx`

- Remove the `autoRecur` field and checkbox.
- The form no longer offers any auto-replicate setting.

### Label

`getResetLabel` in `BenefitCard.tsx`:

- `subscription` + latest record's `propagateNext === true` → "订阅·自动"
- `subscription` otherwise → "订阅"

### Today-driven components

Components that previously called `new Date()` directly for
eligibility/period calculations now read `now` from the store:

- `BenefitCard` (via prop or hook)
- `Dashboard` (filter counts)
- `ByUrgencyView`, `ByCardView` (tray)
- Reminder banner

A small `useToday()` hook wrapping `useCardStore((s) => s.now)` keeps
call sites concise.

## Migration

Runs inside the existing `migrateCards` util (`src/utils/migrations.ts`).

For each benefit where the legacy `autoRecur === true`:

1. For each monthly `usageRecord`, set `propagateNext = true` **unless**
   the record's `YYYY-MM` key is in `cancelledMonths`.
2. Delete the `autoRecur` field.
3. Delete the `cancelledMonths` field.

For benefits with `autoRecur === false` or undefined: no record changes;
just drop the field for consistency.

Idempotent: once a benefit has no `autoRecur` field, the migration is a
no-op.

## Non-Goals

- Per-record propagation flags on non-monthly benefits. Quarterly,
  annual, and one-time benefits remain unaffected.
- Propagating forward by more than one month at a time (no "skip
  forward" behavior).
- A retroactive "stop propagating" action that removes already-generated
  future records. Chain only breaks going forward, as soon as the user
  toggles off or deletes the latest record.

## Testing

### Unit — `subscription.ts`

- `getPrevMonthRecord(benefit, today)` — finds previous month's record,
  returns `undefined` when absent.
- Updated `resolveAutoRecurValue` if still needed (likely replaced by
  direct record lookup).

### Unit — `period.ts`

- No logic changes; existing tests remain.

### Store — `useCardStore.test.ts`

- `generateAutoRecurRecords` under per-record model:
  - previous month `propagateNext=true`, current month empty → creates
    record with `propagateNext=true`
  - previous month `propagateNext=false` → no creation
  - previous month missing → no creation
  - current month already has record → no creation
  - two-month gap → no creation (explicit re-enable required)
- `recalculate()` bumps `now` and triggers generation.
- `setBenefitCycleUsed` with `opts.propagateNext` passed through.

### Store — migration

- Benefit with `autoRecur=true`, 3 monthly records, `cancelledMonths=['2026-02']`:
  Feb record stays without `propagateNext`, others get `propagateNext=true`.
  Both legacy fields removed.

### Component

- Usage prompt shows 自动续期下月 checkbox for subscription + calendar-monthly
  benefits; not for quarterly/annual/anniversary/one_time.
- Clicking a used monthly record opens edit-mode prompt (not simple
  uncheck).
- `BenefitEditor` has no `autoRecur` field.

### Integration

- Window focus fires `recalculate`. Verified by dispatching a `focus`
  event in JSDOM.
- Daily timer registration and cleanup on unmount.

## Files Touched

| File | Change |
| --- | --- |
| `src/models/types.ts` | Remove `autoRecur`, `cancelledMonths`; add `propagateNext`; add `now` to store state |
| `src/utils/subscription.ts` | Refactor helpers to work with per-record state |
| `src/stores/useCardStore.ts` | `recalculate`, rewritten `generateAutoRecurRecords`, extend `setBenefitCycleUsed` with `propagateNext`, remove all `autoRecur`/`cancelledMonths` references |
| `src/utils/migrations.ts` | Add legacy autoRecur → propagateNext migration |
| `src/utils/reminder.ts` | Drop any remaining autoRecur references |
| `src/utils/benefitDisplay.ts` | Label driven by latest record's `propagateNext` |
| `src/utils/period.ts` | Remove `autoRecur` parameter wherever still present |
| `src/views/main/BenefitEditor.tsx` | Remove autoRecur checkbox |
| `src/views/shared/BenefitCard.tsx` | Add 自动续期下月 checkbox in prompt; support edit-mode on used monthly records; read `now` from store |
| `src/views/main/MainWindow.tsx` | Window focus listener + midnight timer |
| `src/views/main/Dashboard.tsx`, `src/views/tray/*.tsx` | Read `now` from store via `useToday` |
| `src/tauri/persistence.ts` | Replace `generateAutoRecurRecords` call with `recalculate` |
| Tests: `useCardStore.test.ts`, `subscription.test.ts`, `migrations.test.ts`, `BenefitCard.test.tsx`, `BenefitEditor.test.tsx`, `reminder.test.ts`, `benefitDisplay.test.ts`, integration/e2e | Update to per-record model, remove autoRecur assertions, add new coverage |
