# Smart Auto-Replicate for Monthly Subscriptions — Design Spec

**Date:** 2026-04-14
**Status:** Approved for implementation

## Goal

Replace the current rigid `autoRecur` behavior for monthly subscription benefits with a smart auto-replicate mode that copies the user's last recorded actualValue into the current month and lets the user edit or cancel it.

## Motivation

Today, `resetType: "subscription"` with `autoRecur: true` auto-generates a record on the 1st of each month with `actualValue = faceValue`, and `isBenefitUsedInPeriod` hardcodes `true` so the record cannot be unchecked or edited. This produces two bad outcomes:

1. Users who paid a different amount (promo, annual prepay, skipped month) have no way to correct the record.
2. Users who canceled the subscription externally have no way to signal "I'm not paying this anymore" — the system keeps marking them paid forever.

## Behavioral Change

### Lazy record generation

`generateAutoRecurRecords` (store action, already exists) runs on app start. For each benefit with `resetType === "subscription"`, `autoRecur === true`, and `resetConfig.period === "monthly"`:

1. If the current month already has a `usageRecord` (date in `[firstOfMonth, endOfMonth]`), skip — nothing to do.
2. Otherwise, insert one new record:
   - `usedDate`: first of current month (`YYYY-MM-01`).
   - `actualValue`: the `actualValue` from the most-recent-by-`usedDate` record across all prior months. If no prior record exists, fall back to `benefit.faceValue`.
   - `faceValue`: `benefit.faceValue` at time of insertion (unchanged snapshot semantics).

### Editable this month

`isBenefitUsedInPeriod` stops hardcoding `true` for autoRecur subscriptions. It uses the normal `usageRecords.some(r => isDateInRange(r.usedDate, currentRange))` check, just like non-autoRecur subscriptions.

Consequences:
- User can uncheck the current month's auto-record via the existing per-cycle toggle flow introduced by the cycle-scoped-toggle plan. Unchecking removes the in-range record from `usageRecords`.
- User can edit `actualValue` by unchecking and re-checking with a new value.
- Once unchecked, `generateAutoRecurRecords` will NOT re-insert in the same month (the lazy check "does current month have a record" is false, but we also need to track that the user explicitly removed it — see "Cancel suppression" below).

### Cancel suppression (same month)

If the user unchecks this month's auto-record, `generateAutoRecurRecords` must not resurrect it on the next app launch within the same month.

**Mechanism:** augment the "skip if current month has a record" check with a second guard. The store action only inserts if the benefit has NEVER been touched this month. We detect "never touched" by requiring that no record exists in the current month AND the benefit was last auto-inserted in a prior month (or never).

Concretely: extract the "last record usedDate" from all `usageRecords`. If any record's `usedDate` falls in the current month, skip. If the most-recent record's `usedDate` is earlier than the current month's start, insert. This is exactly the existing logic — **it already handles cancel suppression correctly**, because once the user deletes this month's record, there is simply no record in the current month AND the next insertion must happen on month rollover.

Wait — that's the problem. Under the current logic, if the user uncheck's this month (deletes the in-range record), next app launch will see "no record this month" and re-insert. We need to prevent this.

**Fix:** add a `cancelledMonths: string[]` field to `Benefit`, storing `YYYY-MM` strings. Unchecking the current month's auto-record adds the current month to `cancelledMonths`. `generateAutoRecurRecords` skips insertion if the current month is in `cancelledMonths`. On month rollover, the new month is not in `cancelledMonths`, so insertion resumes.

### Next month replication after cancel

Cancellation does NOT propagate. Month N+1's insertion looks at "most recent record across all prior months ordered by `usedDate`." If month N was cancelled (no record), the source is month N-1's `actualValue`. If the user has never recorded anything and only cancellations exist, fall back to `faceValue`.

### Reminders

If the user cancels this month, `getDeadline` should return the end of the current month (so reminders fire again). Today, `getDeadline` returns `null` unconditionally for autoRecur subscriptions. Under the new semantics, it returns `null` only when a record exists in the current month; otherwise it returns the end of the current month.

This aligns with the user's implicit signal: "I don't want this auto-filled anymore, remind me like any other monthly benefit."

## Scope Limits

- **Subscription-only.** No change to `calendar` / `anniversary` / `since_last_use` / `one_time`.
- **Monthly-only.** `autoRecur` is only meaningful for monthly subscriptions. Quarterly/annual subscriptions are out of scope; the helper explicitly requires `period === "monthly"`.
- **No UI for `cancelledMonths`.** The field is internal. Users interact via check/uncheck.
- **No migration.** Existing users' auto-generated records (where `actualValue = faceValue`) remain valid under the new rules.

## Data Model Changes

```ts
interface Benefit {
  // ... existing fields ...
  cancelledMonths?: string[]; // YYYY-MM, only for monthly autoRecur subscriptions
}
```

Optional field. Omitted on non-subscription benefits. Validated in import as `string[]` matching `/^\d{4}-\d{2}$/`.

## New Helpers

### `resolveAutoRecurValue(benefit: Benefit): number`

Returns the `actualValue` to use when inserting a new auto-record. Logic:

1. Sort `benefit.usageRecords` by `usedDate` descending.
2. Return the first record's `actualValue`.
3. If no records exist, return `benefit.faceValue`.

Located in `src/utils/subscription.ts` (new file).

## Store Changes

### `generateAutoRecurRecords` (modified)

```ts
generateAutoRecurRecords: () => {
  const today = new Date();
  const monthKey = formatMonthKey(today); // "YYYY-MM"
  const monthRange = getMonthRange(today.getFullYear(), today.getMonth() + 1);

  set((state) => ({
    cards: state.cards.map((card) => ({
      ...card,
      benefits: card.benefits.map((benefit) => {
        if (benefit.resetType !== "subscription" || !benefit.autoRecur) return benefit;
        if (benefit.resetConfig.period !== "monthly") return benefit;

        // User cancelled this month — respect that.
        if (benefit.cancelledMonths?.includes(monthKey)) return benefit;

        // Record already exists for this month.
        const hasRecordThisMonth = benefit.usageRecords.some(
          (r) => r.usedDate >= monthRange.start && r.usedDate <= monthRange.end,
        );
        if (hasRecordThisMonth) return benefit;

        const newRecord: UsageRecord = {
          usedDate: monthRange.start,
          faceValue: benefit.faceValue,
          actualValue: resolveAutoRecurValue(benefit),
        };
        return { ...benefit, usageRecords: [...benefit.usageRecords, newRecord] };
      }),
    })),
  }));
},
```

### Cancel suppression on uncheck

`setBenefitCycleUsed` (store action, introduced by cycle-scoped-toggle plan) already handles record removal via date-range filtering. We extend it:

If the benefit is a monthly autoRecur subscription AND the action is `used=false` AND the cycle is the current month, add the current month's `monthKey` to `cancelledMonths`. On `used=true` for the same cycle, remove it from `cancelledMonths` (user changed their mind).

## Period Utility Changes

### `isBenefitUsedInPeriod` (modified)

Remove the short-circuit at the top that returns `true` for autoRecur subscriptions. Fall through to the standard range check. All other branches unchanged.

### `getDeadline` (modified)

Remove the short-circuit that returns `null` for autoRecur subscriptions. Fall through to the standard monthly calendar deadline (end of current month).

## UI Changes

- **Label:** "订阅·自动" stays. Add a tooltip on the period pill: "自动填充上月金额，可修改或取消".
- **Check/uncheck:** No new UI. The existing per-cycle toggle flow (cycle-scoped-toggle plan) handles it, since `isBenefitUsedInPeriod` now reports the truth.

## Testing

### Unit — `src/utils/subscription.test.ts`
- `resolveAutoRecurValue` returns most-recent record's `actualValue` when records exist.
- Returns `faceValue` when no records exist.
- Sorts records by `usedDate` string descending (ISO format sorts lexicographically).

### Unit — `src/utils/period.test.ts`
- `isBenefitUsedInPeriod` for autoRecur monthly subscription returns `false` when current month has no record (regression: previously `true`).
- Returns `true` when current month has a record.
- `getDeadline` returns end-of-month for autoRecur monthly subscription (unconditionally, like any other monthly calendar benefit). Reminder filtering already excludes used benefits at a higher layer.

### Store — `src/stores/useCardStore.test.ts`
- `generateAutoRecurRecords` inserts a record using previous month's `actualValue`, not `faceValue`.
- Falls back to `faceValue` when no prior records exist.
- Does not insert when current month already has a record.
- Does not insert when current month is in `cancelledMonths`.
- `setBenefitCycleUsed` with `used=false` on the current month adds `monthKey` to `cancelledMonths`.
- `setBenefitCycleUsed` with `used=true` on the current month removes `monthKey` from `cancelledMonths`.

### Integration — `tests/store-integration.test.ts`
- Full flow: create monthly autoRecur subscription with `faceValue=20` → generate runs → record at 20 → user checks again next month with `actualValue=15` → month advances → generate runs → new record at 15 (replication).
- Cancel flow: user unchecks current month → `cancelledMonths` populated → generate runs again → no resurrection. Month rollover → generate inserts normally.

## Tasks

Fits in one plan of ~5 tasks (helper + tests, types update, store changes, period.ts changes, UI tooltip). No split needed.

## Non-Goals

- Quarterly/annual subscription replication (out of scope).
- UI surface for cancelled months (not visible to users).
- Bulk editing of historical auto-records (not needed).
- Automatic detection of "cancelled externally" (out of scope — requires bank integration).
