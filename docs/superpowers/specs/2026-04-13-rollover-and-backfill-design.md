# Rollover Benefits & Historical Backfill

## Overview

Two related features for the Credit Card Benefits Tracker:

1. **Rollover benefits** — Some benefits (e.g., Amex FHR) allow unused quota to accumulate across periods. Users can explicitly roll over a period's quota instead of using it, making the next period's available value the sum of rolled-over and current quotas.
2. **Historical backfill** — When adding a card with a past open date, a progressive dialog guides the user through recording past usage and rollover state so ROI calculations and current-period availability are accurate from day one.

## Feature 1: Rollover Benefits

### Data Model Changes

**`BenefitTemplate`** — add two fields:

```typescript
rolloverable: boolean;       // whether this benefit supports rollover
rolloverMaxYears: number;    // max accumulation window (default: 2)
```

These fields propagate to `Benefit` instances created from templates and are editable per-benefit afterward.

**`Benefit`** — add the same two fields:

```typescript
rolloverable: boolean;
rolloverMaxYears: number;
```

**`UsageRecord`** — add one optional field:

```typescript
isRollover?: boolean;  // true = this record represents a rollover, not actual consumption
```

### Rollover Record Semantics

When a user clicks "Rollover" on a benefit:

- A `UsageRecord` is written: `{ usedDate: <current date>, faceValue: 0, actualValue: 0, isRollover: true }`
- The period is marked as "handled" — it no longer appears as unused
- The quota carries forward to the next period

### Available Value Calculation

For a rolloverable benefit, the current period's available value is:

```
availableValue = benefit.faceValue + sum(faceValue of consecutive prior rollover periods)
```

Calculation rules:

1. Start from the period immediately before the current one
2. Walk backward through periods, checking `usageRecords` for each
3. If a period has an `isRollover: true` record, add the benefit's configured `faceValue` (not the record's faceValue which is 0) to the accumulator and continue
4. If a period has a non-rollover usage record (actual consumption) or no record at all, stop
5. Maximum lookback = `rolloverMaxYears` converted to period count:
   - monthly → `rolloverMaxYears * 12`
   - quarterly → `rolloverMaxYears * 4`
   - semi_annual → `rolloverMaxYears * 2`
   - annual → `rolloverMaxYears`

### Rollover Applicability

Rollover only applies to `calendar` reset type benefits. The `rolloverable` flag is ignored for other reset types (anniversary, since_last_use, subscription, one_time).

### UI Changes

**BenefitCard:**

- Rolloverable benefits display a rollover indicator/badge (e.g., "可Roll" tag)
- When unused, the action area shows two buttons: "标记使用" and "Rollover"
- Available value display shows accumulated total instead of single-period faceValue when rollover quota exists
- Clicking "Rollover" writes the rollover record directly (no value prompt needed since faceValue is always 0)

**BenefitEditor:**

- Add "可累积 (Rollover)" checkbox, visible when `resetType === "calendar"`
- Add "累积上限 (年)" number input, visible when rollover is checked (default: 2)

### Template Changes

Update `amex_platinum.json`:

- FHR H1 benefit: add `"rolloverable": true, "rolloverMaxYears": 2`
- FHR H2 benefit: add `"rolloverable": true, "rolloverMaxYears": 2`

Other benefits remain `rolloverable: false` (or omitted, defaulting to false).

## Feature 2: Historical Backfill Dialog

### Trigger Condition

- Card is being **newly added** (not edited)
- `cardOpenDate` is before today
- Card has at least one benefit with periods that fall in the past

If no past periods exist, the dialog does not appear.

### Progressive Dialog Flow

The dialog appears after the card is successfully added. It is a modal with step-by-step progression.

**Step 1 — Non-rollover benefit backfill (past 1 year):**

- Scope: all non-rollover benefits whose reset periods overlap the past 12 months from today
- Display: list of benefits grouped by period (e.g., "Q1 2026", "March 2026"), most recent first
- Per benefit-period: user selects "已用" or "未用"
  - "已用": optional actual value input (defaults to faceValue)
  - "未用": no record written
- "已用" selections write a `UsageRecord` with the period's start date as `usedDate`
- Skip button available to skip this entire step

**Step 2 — Rollover benefit backfill:**

- Scope: all rolloverable benefits
- Per benefit: show the benefit name and ask "截至当前，你有多少累积的 rollover 额度？"
  - Input: a single dollar amount (e.g., 300 for one quarter of FHR rolled over)
  - System calculates how many periods that represents: `periodsRolled = totalRollover / benefit.faceValue`
  - System generates that many `isRollover: true` records, one per prior period, working backward from the most recent past period
- Skip button available

**Step 3 — Summary & confirmation:**

- Display a summary of what was recorded
- "完成" button closes the dialog

### Edge Cases

- If the card has no past periods at all, skip the dialog entirely
- If all benefits are rollover-only or all are non-rollover, skip the irrelevant step
- Rollover amount input is clamped to `rolloverMaxYears` worth of periods × faceValue
- If the user enters a rollover amount that isn't a clean multiple of faceValue, round down to the nearest whole period count

## Implementation Notes

### New Pure Functions (utils/period.ts or new utils/rollover.ts)

- `getAvailableValue(benefit, today, cardOpenDate)` — computes current available value including rollover accumulation
- `getPastPeriods(benefit, today, cardOpenDate, maxLookbackMonths)` — returns list of past period ranges for backfill
- `generateRolloverRecords(benefit, rolloverAmount, today, cardOpenDate)` — creates rollover UsageRecords from a total dollar amount

### New Component

- `BackfillDialog` — modal component for the progressive backfill flow, rendered after card creation in CardEditor or its parent

### Store Changes

- `toggleBenefitUsage` already accepts `usedDate` — rollover records can use the same action with an additional flag, or a new `rolloverBenefit(cardId, benefitId)` action may be cleaner
- Consider a dedicated `backfillBenefitUsage(cardId, benefitId, records: UsageRecord[])` action for bulk-writing historical records

### Testing Priority

- Available value calculation with various rollover chain lengths and period types
- Rollover max years clamping
- Backfill record generation from a dollar amount
- Edge cases: partial years, cross-year rollover chains, benefit with no past periods
