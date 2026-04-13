# Rollover Benefits & Historical Backfill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add rollover benefit accumulation and a post-card-creation backfill dialog so users can track benefits like Amex FHR that carry unused quota forward.

**Architecture:** New `rolloverable` / `rolloverMaxYears` fields on `BenefitTemplate` and `Benefit`; `isRollover` flag on `UsageRecord`. Pure rollover logic in `src/utils/rollover.ts`. New `BackfillDialog` modal renders after card creation in `MainWindow`. Store gains `rolloverBenefit` and `backfillBenefitUsage` actions.

**Tech Stack:** React, TypeScript, Zustand, Vitest, React Testing Library

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `src/models/types.ts` | Add `rolloverable`, `rolloverMaxYears` to `BenefitTemplate`/`Benefit`; `isRollover?` to `UsageRecord` |
| Modify | `src/assets/card-types/amex_platinum.json` | Merge FHR H1+H2 into single semi_annual benefit with rollover fields |
| Modify | `src/models/cardTypeLoader.ts:24-32` | Default `rolloverable: false`, `rolloverMaxYears: 2` when loading templates |
| Create | `src/utils/rollover.ts` | `getAvailableValue`, `getPastPeriods`, `generateRolloverRecords` |
| Create | `src/utils/rollover.test.ts` | Unit tests for all rollover pure functions |
| Modify | `src/stores/useCardStore.ts:10-26` | Add `rolloverBenefit`, `backfillBenefitUsage` actions |
| Modify | `src/views/shared/BenefitCard.tsx` | Rollover badge, rollover button, accumulated value display |
| Modify | `src/views/main/BenefitEditor.tsx:13-28,86-111,190-220` | Rollover checkbox + max years input in form |
| Create | `src/views/main/BackfillDialog.tsx` | Progressive modal for historical backfill |
| Create | `src/views/main/BackfillDialog.css` | Styles for backfill dialog |
| Modify | `src/views/main/MainWindow.tsx:57-86` | Wire BackfillDialog after new card creation |
| Modify | `src/styles/glass.css` | Rollover badge + rollover button styles |

---

### Task 1: Data Model — Add Rollover Fields to Types

**Files:**
- Modify: `src/models/types.ts:38-45` (BenefitTemplate), `src/models/types.ts:59-63` (UsageRecord), `src/models/types.ts:65-76` (Benefit)
- Test: `src/models/types.test.ts`

- [ ] **Step 1: Update `BenefitTemplate` interface**

In `src/models/types.ts`, add two fields to the `BenefitTemplate` interface (after `resetConfig`):

```typescript
export interface BenefitTemplate {
  name: string;
  description: string;
  faceValue: number;
  category: BenefitCategory;
  resetType: ResetType;
  resetConfig: ResetConfig;
  rolloverable?: boolean;
  rolloverMaxYears?: number;
}
```

- [ ] **Step 2: Update `UsageRecord` interface**

Add the `isRollover` field:

```typescript
export interface UsageRecord {
  usedDate: string;
  faceValue: number;
  actualValue: number;
  isRollover?: boolean;
}
```

- [ ] **Step 3: Update `Benefit` interface**

Add rollover fields to `Benefit`:

```typescript
export interface Benefit {
  id: string;
  name: string;
  description: string;
  faceValue: number;
  category: BenefitCategory;
  resetType: ResetType;
  resetConfig: ResetConfig;
  isHidden: boolean;
  autoRecur: boolean;
  rolloverable: boolean;
  rolloverMaxYears: number;
  usageRecords: UsageRecord[];
}
```

- [ ] **Step 4: Update type tests**

In `src/models/types.test.ts`, add a test verifying the new fields:

```typescript
it("supports rolloverable and rolloverMaxYears on Benefit", () => {
  const b: Benefit = {
    id: "b1",
    name: "FHR",
    description: "",
    faceValue: 300,
    category: "hotel",
    resetType: "calendar",
    resetConfig: { period: "semi_annual" },
    isHidden: false,
    autoRecur: false,
    rolloverable: true,
    rolloverMaxYears: 2,
    usageRecords: [],
  };
  expect(b.rolloverable).toBe(true);
  expect(b.rolloverMaxYears).toBe(2);
});

it("supports isRollover on UsageRecord", () => {
  const r: UsageRecord = {
    usedDate: "2026-01-01",
    faceValue: 0,
    actualValue: 0,
    isRollover: true,
  };
  expect(r.isRollover).toBe(true);
});
```

- [ ] **Step 5: Run tests**

Run: `npm run test -- --run src/models/types.test.ts`
Expected: PASS

- [ ] **Step 6: Fix all existing code that constructs `Benefit` objects**

Every place that creates a `Benefit` now needs `rolloverable` and `rolloverMaxYears`. Search and fix:

1. `src/views/main/CardEditor.tsx:267-272` — where `defaultBenefits` are mapped to `Benefit[]`. Add:
   ```typescript
   rolloverable: b.rolloverable ?? false,
   rolloverMaxYears: b.rolloverMaxYears ?? 2,
   ```

2. `src/views/main/BenefitEditor.tsx:99-110` — `buildBenefit()`. Add:
   ```typescript
   rolloverable: benefit?.rolloverable ?? false,
   rolloverMaxYears: benefit?.rolloverMaxYears ?? 2,
   ```

3. Any test helper `makeBenefit()` functions in:
   - `src/views/shared/BenefitCard.test.tsx`
   - `src/views/tray/ByCardView.test.tsx`
   - `src/views/tray/ByUrgencyView.test.tsx`
   - `src/stores/useCardStore.test.ts`
   - `tests/store-integration.test.ts`
   - `src/utils/period.test.ts` (the `mb` helper)

   Add `rolloverable: false, rolloverMaxYears: 2` to each helper's defaults.

- [ ] **Step 7: Run full test suite**

Run: `npm run test -- --run`
Expected: ALL PASS

- [ ] **Step 8: Commit**

```bash
git add src/models/types.ts src/models/types.test.ts src/views/main/CardEditor.tsx src/views/main/BenefitEditor.tsx src/views/shared/BenefitCard.test.tsx src/views/tray/ByCardView.test.tsx src/views/tray/ByUrgencyView.test.tsx src/stores/useCardStore.test.ts tests/store-integration.test.ts src/utils/period.test.ts
git commit -m "add rolloverable and rolloverMaxYears to Benefit, isRollover to UsageRecord"
```

---

### Task 2: Update Amex Platinum Template — Merge FHR

**Files:**
- Modify: `src/assets/card-types/amex_platinum.json`
- Modify: `src/models/cardTypeLoader.ts:24-32`
- Test: `src/models/templates.test.ts`

- [ ] **Step 1: Merge FHR H1 + H2 in `amex_platinum.json`**

Remove the two FHR entries (lines 7-21 with H1/H2 and `applicableMonths`). Replace with one:

```json
{
  "name": "$300 Hotel Credit FHR/THC",
  "description": "Fine Hotels + Resorts or The Hotel Collection credit, per half-year",
  "faceValue": 300,
  "category": "hotel",
  "resetType": "calendar",
  "resetConfig": { "period": "semi_annual" },
  "rolloverable": true,
  "rolloverMaxYears": 2
}
```

- [ ] **Step 2: Update `parseCardTypeJson` to propagate rollover fields**

In `src/models/cardTypeLoader.ts`, update the `parseCardTypeJson` function to pass through rollover fields from JSON. The `defaultBenefits` are cast as `BenefitTemplate[]` at line 30, so the fields flow through automatically. No code change needed here — the JSON fields are already covered by the `BenefitTemplate` interface (which now has `rolloverable?` and `rolloverMaxYears?`).

- [ ] **Step 3: Update template tests**

In `src/models/templates.test.ts`, update the test that checks Amex Platinum benefit count (it was 13 with H1+H2, now 12 with merged FHR). Also add a test verifying rollover fields:

```typescript
it("FHR benefit is rolloverable with semi_annual period", () => {
  const platinum = BUILTIN_CARD_TYPES.find((t) => t.slug === "amex_platinum")!;
  const fhr = platinum.defaultBenefits.find((b) => b.name.includes("FHR"));
  expect(fhr).toBeDefined();
  expect(fhr!.resetConfig.period).toBe("semi_annual");
  expect(fhr!.rolloverable).toBe(true);
  expect(fhr!.rolloverMaxYears).toBe(2);
});
```

- [ ] **Step 4: Run tests**

Run: `npm run test -- --run src/models/templates.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/assets/card-types/amex_platinum.json src/models/templates.test.ts
git commit -m "merge FHR H1/H2 into single semi_annual benefit with rollover"
```

---

### Task 3: Rollover Pure Functions — `getAvailableValue` and Helpers

**Files:**
- Create: `src/utils/rollover.ts`
- Create: `src/utils/rollover.test.ts`

- [ ] **Step 1: Write failing tests for `getPeriodRangeAt`**

`getPeriodRangeAt` returns the period range that contains a given date. It reuses `getCalendarPeriodRange` from `period.ts` but for an arbitrary reference date, not just "today".

Create `src/utils/rollover.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import type { Benefit } from "../models/types";
import { getPeriodRangeAt, getAvailableValue, getPastPeriods, generateRolloverRecords } from "./rollover";

const d = (iso: string) => new Date(iso + "T00:00:00");

const makeBenefit = (overrides: Partial<Benefit> = {}): Benefit => ({
  id: "b1",
  name: "FHR",
  description: "",
  faceValue: 300,
  category: "hotel",
  resetType: "calendar",
  resetConfig: { period: "semi_annual" },
  isHidden: false,
  autoRecur: false,
  rolloverable: true,
  rolloverMaxYears: 2,
  usageRecords: [],
  ...overrides,
});

describe("getPeriodRangeAt", () => {
  it("returns correct semi_annual range for H1", () => {
    const range = getPeriodRangeAt(d("2026-03-15"), "semi_annual");
    expect(range).toEqual({ start: "2026-01-01", end: "2026-06-30" });
  });

  it("returns correct semi_annual range for H2", () => {
    const range = getPeriodRangeAt(d("2026-09-01"), "semi_annual");
    expect(range).toEqual({ start: "2026-07-01", end: "2026-12-31" });
  });

  it("returns correct quarterly range for Q2", () => {
    const range = getPeriodRangeAt(d("2026-05-10"), "quarterly");
    expect(range).toEqual({ start: "2026-04-01", end: "2026-06-30" });
  });

  it("returns correct monthly range", () => {
    const range = getPeriodRangeAt(d("2026-02-15"), "monthly");
    expect(range).toEqual({ start: "2026-02-01", end: "2026-02-28" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- --run src/utils/rollover.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `getPeriodRangeAt`**

Create `src/utils/rollover.ts`:

```typescript
import type { Benefit, CalendarPeriod, UsageRecord } from "../models/types";
import type { DateRange } from "./period";
import { getCalendarPeriodRange } from "./period";

/**
 * Returns the calendar period range that contains the given date.
 */
export const getPeriodRangeAt = (date: Date, period: CalendarPeriod): DateRange => {
  return getCalendarPeriodRange(date, period);
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- --run src/utils/rollover.test.ts`
Expected: PASS

- [ ] **Step 5: Write failing tests for `getPreviousPeriodStart`**

Add to `src/utils/rollover.test.ts`:

```typescript
import { getPreviousPeriodStart } from "./rollover";

describe("getPreviousPeriodStart", () => {
  it("returns previous semi_annual start from H2", () => {
    const prev = getPreviousPeriodStart(d("2026-07-01"), "semi_annual");
    expect(prev).toEqual(d("2026-01-01"));
  });

  it("returns previous semi_annual start from H1 (crosses year)", () => {
    const prev = getPreviousPeriodStart(d("2026-01-01"), "semi_annual");
    expect(prev).toEqual(d("2025-07-01"));
  });

  it("returns previous quarterly start from Q2", () => {
    const prev = getPreviousPeriodStart(d("2026-04-01"), "quarterly");
    expect(prev).toEqual(d("2026-01-01"));
  });

  it("returns previous quarterly start from Q1 (crosses year)", () => {
    const prev = getPreviousPeriodStart(d("2026-01-01"), "quarterly");
    expect(prev).toEqual(d("2025-10-01"));
  });

  it("returns previous monthly start", () => {
    const prev = getPreviousPeriodStart(d("2026-03-01"), "monthly");
    expect(prev).toEqual(d("2026-02-01"));
  });

  it("returns previous monthly start from January (crosses year)", () => {
    const prev = getPreviousPeriodStart(d("2026-01-01"), "monthly");
    expect(prev).toEqual(d("2025-12-01"));
  });
});
```

- [ ] **Step 6: Implement `getPreviousPeriodStart`**

Add to `src/utils/rollover.ts`:

```typescript
/**
 * Given the first day of a period, returns the first day of the immediately prior period.
 */
export const getPreviousPeriodStart = (periodStart: Date, period: CalendarPeriod): Date => {
  const year = periodStart.getFullYear();
  const month = periodStart.getMonth(); // 0-based

  switch (period) {
    case "monthly":
      return new Date(year, month - 1, 1);
    case "quarterly":
      return new Date(year, month - 3, 1);
    case "semi_annual":
      return new Date(year, month - 6, 1);
    case "annual":
      return new Date(year - 1, 0, 1);
    case "every_4_years":
      return new Date(year - 4, 0, 1);
  }
};
```

- [ ] **Step 7: Run tests**

Run: `npm run test -- --run src/utils/rollover.test.ts`
Expected: PASS

- [ ] **Step 8: Write failing tests for `getAvailableValue`**

Add to `src/utils/rollover.test.ts`:

```typescript
describe("getAvailableValue", () => {
  it("returns faceValue when no rollover records exist", () => {
    const benefit = makeBenefit();
    expect(getAvailableValue(benefit, d("2026-07-01"))).toBe(300);
  });

  it("returns faceValue when benefit is not rolloverable", () => {
    const benefit = makeBenefit({ rolloverable: false });
    expect(getAvailableValue(benefit, d("2026-07-01"))).toBe(300);
  });

  it("accumulates one rolled-over period", () => {
    const benefit = makeBenefit({
      usageRecords: [
        { usedDate: "2026-03-01", faceValue: 0, actualValue: 0, isRollover: true },
      ],
    });
    // H1 was rolled over → H2 available = 300 (H2) + 300 (H1 rolled) = 600
    expect(getAvailableValue(benefit, d("2026-07-15"))).toBe(600);
  });

  it("accumulates multiple consecutive rollover periods", () => {
    const benefit = makeBenefit({
      resetConfig: { period: "quarterly" },
      faceValue: 100,
      usageRecords: [
        { usedDate: "2026-01-15", faceValue: 0, actualValue: 0, isRollover: true },
        { usedDate: "2026-04-15", faceValue: 0, actualValue: 0, isRollover: true },
      ],
    });
    // Q1 rolled, Q2 rolled → Q3 available = 100 + 100 + 100 = 300
    expect(getAvailableValue(benefit, d("2026-07-15"))).toBe(300);
  });

  it("stops accumulation at a non-rollover usage record", () => {
    const benefit = makeBenefit({
      resetConfig: { period: "quarterly" },
      faceValue: 100,
      usageRecords: [
        { usedDate: "2026-01-15", faceValue: 100, actualValue: 80 }, // actual use in Q1
        { usedDate: "2026-04-15", faceValue: 0, actualValue: 0, isRollover: true }, // Q2 rolled
      ],
    });
    // Q1 was used (not rolled), Q2 rolled → Q3 = 100 + 100 = 200
    expect(getAvailableValue(benefit, d("2026-07-15"))).toBe(200);
  });

  it("stops accumulation at a period with no record", () => {
    const benefit = makeBenefit({
      resetConfig: { period: "quarterly" },
      faceValue: 100,
      usageRecords: [
        // Q1: no record at all
        { usedDate: "2026-04-15", faceValue: 0, actualValue: 0, isRollover: true }, // Q2 rolled
      ],
    });
    // Q1 has no record → stop. Q2 rolled → Q3 = 100 + 100 = 200
    expect(getAvailableValue(benefit, d("2026-07-15"))).toBe(200);
  });

  it("respects rolloverMaxYears limit", () => {
    const benefit = makeBenefit({
      resetConfig: { period: "semi_annual" },
      faceValue: 300,
      rolloverMaxYears: 1, // max 2 semi_annual periods lookback
      usageRecords: [
        { usedDate: "2025-01-15", faceValue: 0, actualValue: 0, isRollover: true }, // 2025 H1
        { usedDate: "2025-07-15", faceValue: 0, actualValue: 0, isRollover: true }, // 2025 H2
        { usedDate: "2026-01-15", faceValue: 0, actualValue: 0, isRollover: true }, // 2026 H1
      ],
    });
    // max 1 year = 2 periods lookback → only count 2026 H1 + 2025 H2
    // 2026 H2 available = 300 + 300 (2026H1) + 300 (2025H2) = 900
    // But wait, maxPeriods = 1 * 2 = 2, so we look back 2 periods from current
    expect(getAvailableValue(benefit, d("2026-07-15"))).toBe(900);
  });

  it("ignores rollover for non-calendar reset types", () => {
    const benefit = makeBenefit({
      resetType: "anniversary",
      rolloverable: true,
      usageRecords: [
        { usedDate: "2026-01-15", faceValue: 0, actualValue: 0, isRollover: true },
      ],
    });
    expect(getAvailableValue(benefit, d("2026-07-15"))).toBe(300);
  });
});
```

- [ ] **Step 9: Implement `getAvailableValue`**

Add to `src/utils/rollover.ts`:

```typescript
const PERIOD_MULTIPLIER: Record<CalendarPeriod, number> = {
  monthly: 12,
  quarterly: 4,
  semi_annual: 2,
  annual: 1,
  every_4_years: 1,
};

/**
 * Computes the available value for a benefit, including accumulated rollover.
 * For non-rolloverable or non-calendar benefits, returns faceValue.
 */
export const getAvailableValue = (benefit: Benefit, today: Date): number => {
  if (!benefit.rolloverable || benefit.resetType !== "calendar") {
    return benefit.faceValue;
  }

  const period = benefit.resetConfig.period;
  if (!period) return benefit.faceValue;

  const maxPeriods = benefit.rolloverMaxYears * PERIOD_MULTIPLIER[period];
  const currentRange = getPeriodRangeAt(today, period);

  let accumulated = benefit.faceValue;
  let lookbackStart = new Date(currentRange.start + "T00:00:00");
  let periodsChecked = 0;

  while (periodsChecked < maxPeriods) {
    lookbackStart = getPreviousPeriodStart(lookbackStart, period);
    const prevRange = getPeriodRangeAt(lookbackStart, period);

    const recordInPeriod = benefit.usageRecords.find(
      (r) => r.usedDate >= prevRange.start && r.usedDate <= prevRange.end,
    );

    if (!recordInPeriod) break;
    if (!recordInPeriod.isRollover) break;

    accumulated += benefit.faceValue;
    periodsChecked++;
  }

  return accumulated;
};
```

- [ ] **Step 10: Run tests**

Run: `npm run test -- --run src/utils/rollover.test.ts`
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add src/utils/rollover.ts src/utils/rollover.test.ts
git commit -m "add rollover pure functions: getPeriodRangeAt, getPreviousPeriodStart, getAvailableValue"
```

---

### Task 4: Rollover Pure Functions — `getPastPeriods` and `generateRolloverRecords`

**Files:**
- Modify: `src/utils/rollover.ts`
- Modify: `src/utils/rollover.test.ts`

- [ ] **Step 1: Write failing tests for `getPastPeriods`**

Add to `src/utils/rollover.test.ts`:

```typescript
describe("getPastPeriods", () => {
  it("returns past semi_annual periods within lookback", () => {
    const periods = getPastPeriods("semi_annual", d("2026-07-15"), 12);
    expect(periods).toEqual([
      { start: "2026-01-01", end: "2026-06-30" },
      { start: "2025-07-01", end: "2025-12-31" },
    ]);
  });

  it("returns past quarterly periods within 12-month lookback", () => {
    const periods = getPastPeriods("quarterly", d("2026-07-15"), 12);
    expect(periods).toEqual([
      { start: "2026-04-01", end: "2026-06-30" },
      { start: "2026-01-01", end: "2026-03-31" },
      { start: "2025-10-01", end: "2025-12-31" },
      { start: "2025-07-01", end: "2025-09-30" },
    ]);
  });

  it("returns past monthly periods within 3-month lookback", () => {
    const periods = getPastPeriods("monthly", d("2026-04-15"), 3);
    expect(periods).toEqual([
      { start: "2026-03-01", end: "2026-03-31" },
      { start: "2026-02-01", end: "2026-02-28" },
      { start: "2026-01-01", end: "2026-01-31" },
    ]);
  });

  it("returns empty array when no past periods exist", () => {
    // today is in the first period, no prior periods within 1 month lookback
    const periods = getPastPeriods("annual", d("2026-04-15"), 6);
    expect(periods).toEqual([]);
  });
});
```

- [ ] **Step 2: Implement `getPastPeriods`**

Add to `src/utils/rollover.ts`:

```typescript
/**
 * Returns past period ranges before the current period, most recent first.
 * Walks backward up to `maxLookbackMonths` months from today.
 */
export const getPastPeriods = (
  period: CalendarPeriod,
  today: Date,
  maxLookbackMonths: number,
): DateRange[] => {
  const currentRange = getPeriodRangeAt(today, period);
  const cutoff = new Date(today);
  cutoff.setMonth(cutoff.getMonth() - maxLookbackMonths);
  const cutoffStr = `${String(cutoff.getFullYear())}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-01`;

  const results: DateRange[] = [];
  let cursor = new Date(currentRange.start + "T00:00:00");

  while (true) {
    cursor = getPreviousPeriodStart(cursor, period);
    const range = getPeriodRangeAt(cursor, period);
    if (range.start < cutoffStr) break;
    results.push(range);
  }

  return results;
};
```

- [ ] **Step 3: Run tests**

Run: `npm run test -- --run src/utils/rollover.test.ts`
Expected: PASS

- [ ] **Step 4: Write failing tests for `generateRolloverRecords`**

Add to `src/utils/rollover.test.ts`:

```typescript
describe("generateRolloverRecords", () => {
  it("generates correct number of rollover records from dollar amount", () => {
    const benefit = makeBenefit({ faceValue: 300, resetConfig: { period: "semi_annual" } });
    const records = generateRolloverRecords(benefit, 600, d("2026-07-15"));
    expect(records).toHaveLength(2);
    expect(records[0]).toEqual({
      usedDate: "2026-01-01",
      faceValue: 0,
      actualValue: 0,
      isRollover: true,
    });
    expect(records[1]).toEqual({
      usedDate: "2025-07-01",
      faceValue: 0,
      actualValue: 0,
      isRollover: true,
    });
  });

  it("rounds down non-exact multiples", () => {
    const benefit = makeBenefit({ faceValue: 300 });
    const records = generateRolloverRecords(benefit, 500, d("2026-07-15"));
    // 500 / 300 = 1.67 → floor to 1
    expect(records).toHaveLength(1);
  });

  it("clamps to rolloverMaxYears worth of periods", () => {
    const benefit = makeBenefit({
      faceValue: 100,
      resetConfig: { period: "quarterly" },
      rolloverMaxYears: 1, // max 4 quarters
    });
    // Request 6 quarters worth = 600, but max is 4 quarters = 400
    const records = generateRolloverRecords(benefit, 600, d("2026-07-15"));
    expect(records).toHaveLength(4);
  });

  it("returns empty array for zero amount", () => {
    const benefit = makeBenefit();
    const records = generateRolloverRecords(benefit, 0, d("2026-07-15"));
    expect(records).toEqual([]);
  });

  it("returns empty array for non-rolloverable benefit", () => {
    const benefit = makeBenefit({ rolloverable: false });
    const records = generateRolloverRecords(benefit, 300, d("2026-07-15"));
    expect(records).toEqual([]);
  });
});
```

- [ ] **Step 5: Implement `generateRolloverRecords`**

Add to `src/utils/rollover.ts`:

```typescript
/**
 * Generates rollover UsageRecords from a total dollar amount.
 * Records are placed in consecutive prior periods, most recent first.
 * Amount is rounded down to the nearest whole period count and clamped
 * to rolloverMaxYears worth of periods.
 */
export const generateRolloverRecords = (
  benefit: Benefit,
  rolloverAmount: number,
  today: Date,
): UsageRecord[] => {
  if (!benefit.rolloverable || benefit.faceValue <= 0 || rolloverAmount <= 0) {
    return [];
  }

  const period = benefit.resetConfig.period;
  if (!period) return [];

  const maxPeriods = benefit.rolloverMaxYears * PERIOD_MULTIPLIER[period];
  let periodsNeeded = Math.floor(rolloverAmount / benefit.faceValue);
  periodsNeeded = Math.min(periodsNeeded, maxPeriods);

  const records: UsageRecord[] = [];
  const currentRange = getPeriodRangeAt(today, period);
  let cursor = new Date(currentRange.start + "T00:00:00");

  for (let i = 0; i < periodsNeeded; i++) {
    cursor = getPreviousPeriodStart(cursor, period);
    const prevRange = getPeriodRangeAt(cursor, period);
    records.push({
      usedDate: prevRange.start,
      faceValue: 0,
      actualValue: 0,
      isRollover: true,
    });
  }

  return records;
};
```

- [ ] **Step 6: Run tests**

Run: `npm run test -- --run src/utils/rollover.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/utils/rollover.ts src/utils/rollover.test.ts
git commit -m "add getPastPeriods and generateRolloverRecords for backfill"
```

---

### Task 5: Store Actions — `rolloverBenefit` and `backfillBenefitUsage`

**Files:**
- Modify: `src/stores/useCardStore.ts:10-26,109-144`
- Test: `src/stores/useCardStore.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `src/stores/useCardStore.test.ts`:

```typescript
describe("rolloverBenefit", () => {
  it("writes a rollover UsageRecord with faceValue 0", () => {
    const card = makeCard({
      benefits: [makeBenefit({ id: "b1", rolloverable: true, rolloverMaxYears: 2 })],
    });
    useCardStore.setState({ cards: [card] });

    useCardStore.getState().rolloverBenefit("c1", "b1");

    const records = useCardStore.getState().cards[0].benefits[0].usageRecords;
    expect(records).toHaveLength(1);
    expect(records[0].faceValue).toBe(0);
    expect(records[0].actualValue).toBe(0);
    expect(records[0].isRollover).toBe(true);
  });

  it("does nothing for non-rolloverable benefit", () => {
    const card = makeCard({
      benefits: [makeBenefit({ id: "b1", rolloverable: false })],
    });
    useCardStore.setState({ cards: [card] });

    useCardStore.getState().rolloverBenefit("c1", "b1");

    const records = useCardStore.getState().cards[0].benefits[0].usageRecords;
    expect(records).toHaveLength(0);
  });
});

describe("backfillBenefitUsage", () => {
  it("appends multiple records at once", () => {
    const card = makeCard({
      benefits: [makeBenefit({ id: "b1" })],
    });
    useCardStore.setState({ cards: [card] });

    const records = [
      { usedDate: "2026-01-01", faceValue: 100, actualValue: 80 },
      { usedDate: "2025-10-01", faceValue: 100, actualValue: 100 },
    ];
    useCardStore.getState().backfillBenefitUsage("c1", "b1", records);

    const stored = useCardStore.getState().cards[0].benefits[0].usageRecords;
    expect(stored).toHaveLength(2);
    expect(stored[0].usedDate).toBe("2026-01-01");
    expect(stored[1].usedDate).toBe("2025-10-01");
  });
});
```

Note: the `makeBenefit` and `makeCard` helpers in this test file need `rolloverable: false, rolloverMaxYears: 2` added (done in Task 1 Step 6).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- --run src/stores/useCardStore.test.ts`
Expected: FAIL — `rolloverBenefit` and `backfillBenefitUsage` not defined

- [ ] **Step 3: Add action signatures to store interface**

In `src/stores/useCardStore.ts`, add to `CardStoreActions`:

```typescript
rolloverBenefit: (cardId: string, benefitId: string, usedDate?: string) => void;
backfillBenefitUsage: (cardId: string, benefitId: string, records: UsageRecord[]) => void;
```

- [ ] **Step 4: Implement `rolloverBenefit`**

Add after `toggleBenefitUsage` in the store implementation:

```typescript
rolloverBenefit: (cardId, benefitId, usedDate?) => {
  const today = new Date();
  set((state) => {
    const card = state.cards.find((c) => c.id === cardId);
    if (!card) return state;
    const benefit = card.benefits.find((b) => b.id === benefitId);
    if (!benefit || !benefit.rolloverable) return state;

    const newRecord: UsageRecord = {
      usedDate: usedDate ?? formatDate(today),
      faceValue: 0,
      actualValue: 0,
      isRollover: true,
    };
    return {
      cards: updateBenefitInCards(state.cards, cardId, benefitId, (b) => ({
        ...b,
        usageRecords: [...b.usageRecords, newRecord],
      })),
    };
  });
},
```

- [ ] **Step 5: Implement `backfillBenefitUsage`**

Add after `rolloverBenefit`:

```typescript
backfillBenefitUsage: (cardId, benefitId, records) => {
  set((state) => ({
    cards: updateBenefitInCards(state.cards, cardId, benefitId, (b) => ({
      ...b,
      usageRecords: [...b.usageRecords, ...records],
    })),
  }));
},
```

- [ ] **Step 6: Run tests**

Run: `npm run test -- --run src/stores/useCardStore.test.ts`
Expected: PASS

- [ ] **Step 7: Run full suite**

Run: `npm run test -- --run`
Expected: ALL PASS

- [ ] **Step 8: Commit**

```bash
git add src/stores/useCardStore.ts src/stores/useCardStore.test.ts
git commit -m "add rolloverBenefit and backfillBenefitUsage store actions"
```

---

### Task 6: BenefitCard UI — Rollover Badge, Button, and Accumulated Value

**Files:**
- Modify: `src/views/shared/BenefitCard.tsx`
- Modify: `src/styles/glass.css`
- Test: `src/views/shared/BenefitCard.test.tsx`

- [ ] **Step 1: Write failing tests**

Add to `src/views/shared/BenefitCard.test.tsx`:

```typescript
it("shows rollover badge for rolloverable benefit", () => {
  const benefit = makeBenefit({ rolloverable: true, rolloverMaxYears: 2 });
  render(<BenefitCard benefit={benefit} card={makeCard()} onToggleUsage={vi.fn()} />);
  expect(screen.getByText("可Roll")).toBeInTheDocument();
});

it("does not show rollover badge for non-rolloverable benefit", () => {
  const benefit = makeBenefit({ rolloverable: false });
  render(<BenefitCard benefit={benefit} card={makeCard()} onToggleUsage={vi.fn()} />);
  expect(screen.queryByText("可Roll")).not.toBeInTheDocument();
});

it("shows rollover button for unused rolloverable benefit", () => {
  const benefit = makeBenefit({ rolloverable: true, rolloverMaxYears: 2 });
  render(
    <BenefitCard benefit={benefit} card={makeCard()} onToggleUsage={vi.fn()} onRollover={vi.fn()} />
  );
  expect(screen.getByLabelText("Rollover")).toBeInTheDocument();
});

it("fires onRollover when rollover button is clicked", () => {
  const handler = vi.fn();
  const benefit = makeBenefit({ id: "b1", rolloverable: true, rolloverMaxYears: 2 });
  const card = makeCard({ id: "c1" });
  render(
    <BenefitCard benefit={benefit} card={card} onToggleUsage={vi.fn()} onRollover={handler} />
  );
  fireEvent.click(screen.getByLabelText("Rollover"));
  expect(handler).toHaveBeenCalledWith("c1", "b1");
});

it("shows accumulated value when rollover records exist", () => {
  const benefit = makeBenefit({
    faceValue: 300,
    rolloverable: true,
    rolloverMaxYears: 2,
    resetConfig: { period: "semi_annual" },
    usageRecords: [
      { usedDate: "2026-03-01", faceValue: 0, actualValue: 0, isRollover: true },
    ],
  });
  // Today is 2026-04-25 (fake timer) — H1 was rolled over, so H1 is "used"
  // but we're still in H1, so available = 300 (current) + 300 (this period's own rollover)
  // Actually at 2026-04-25 we're in H1. The rollover record is in H1.
  // getAvailableValue looks at prior periods from current.
  // Let's adjust: set today to H2 so the H1 rollover is in a prior period
  // The test uses vi.setSystemTime("2026-04-25") from beforeEach — that's H1.
  // We need the rollover record to be in a prior period. Use a 2025 H2 record:
  const benefit2 = makeBenefit({
    faceValue: 300,
    rolloverable: true,
    rolloverMaxYears: 2,
    resetConfig: { period: "quarterly" },
    usageRecords: [
      { usedDate: "2026-01-15", faceValue: 0, actualValue: 0, isRollover: true },
    ],
  });
  // Today is 2026-04-25 → Q2. Q1 was rolled → available = 300 + 300 = 600
  render(<BenefitCard benefit={benefit2} card={makeCard()} onToggleUsage={vi.fn()} />);
  expect(screen.getByText("$600")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- --run src/views/shared/BenefitCard.test.tsx`
Expected: FAIL

- [ ] **Step 3: Update `BenefitCardProps` and add rollover UI**

In `src/views/shared/BenefitCard.tsx`:

1. Add `onRollover` to props:
   ```typescript
   interface BenefitCardProps {
     benefit: Benefit;
     card: CreditCard;
     onToggleUsage: (cardId: string, benefitId: string, actualValue?: number, usedDate?: string) => void;
     onRollover?: (cardId: string, benefitId: string) => void;
     onToggleHidden?: (cardId: string, benefitId: string) => void;
     onDelete?: (cardId: string, benefitId: string) => void;
     compact?: boolean;
   }
   ```

2. Import `getAvailableValue`:
   ```typescript
   import { getAvailableValue } from "../../utils/rollover";
   ```

3. Compute available value in the component body:
   ```typescript
   const availableValue = getAvailableValue(benefit, today);
   ```

4. Add rollover badge in the header (after the period label):
   ```tsx
   {benefit.rolloverable && (
     <span className="benefit-card__rollover-badge">可Roll</span>
   )}
   ```

5. Update the value display to show accumulated value:
   ```tsx
   <span className="benefit-card__value">
     {availableValue > 0 ? `$${String(availableValue)}` : "—"}
   </span>
   ```

6. Add rollover button in the actions area (before the check button), when `onRollover` is provided and the benefit is rolloverable and unused:
   ```tsx
   {onRollover && benefit.rolloverable && !isUsed && (
     <button
       className="benefit-card__action-btn benefit-card__rollover-btn"
       onClick={() => { onRollover(card.id, benefit.id); }}
       aria-label="Rollover"
       title="Rollover"
     >
       ↗
     </button>
   )}
   ```

- [ ] **Step 4: Add CSS for rollover badge and button**

In `src/styles/glass.css`, add after the existing `.benefit-card__period` rule:

```css
.benefit-card__rollover-badge {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--tag-info-bg, rgba(0, 122, 255, 0.12));
  color: var(--color-blue, #007aff);
  font-weight: 500;
}

.benefit-card__rollover-btn {
  color: var(--color-blue, #007aff);
  font-size: 14px;
  font-weight: 600;
}

.benefit-card__rollover-btn:hover {
  background: var(--tag-info-bg, rgba(0, 122, 255, 0.12));
}
```

- [ ] **Step 5: Run tests**

Run: `npm run test -- --run src/views/shared/BenefitCard.test.tsx`
Expected: PASS

- [ ] **Step 6: Wire `onRollover` in parent components**

In `src/views/main/CardDetail.tsx`, add the store binding and pass it down:

```typescript
const rolloverBenefit = useCardStore((s) => s.rolloverBenefit);
```

And on the `BenefitCard`:
```tsx
onRollover={rolloverBenefit}
```

In `src/views/tray/ByCardView.tsx` and `src/views/tray/ByUrgencyView.tsx`, also pass `onRollover`:

```typescript
const rolloverBenefit = useCardStore((s) => s.rolloverBenefit);
```
```tsx
onRollover={rolloverBenefit}
```

- [ ] **Step 7: Run full test suite**

Run: `npm run test -- --run`
Expected: ALL PASS

- [ ] **Step 8: Commit**

```bash
git add src/views/shared/BenefitCard.tsx src/views/shared/BenefitCard.test.tsx src/styles/glass.css src/views/main/CardDetail.tsx src/views/tray/ByCardView.tsx src/views/tray/ByUrgencyView.tsx
git commit -m "add rollover badge, button, and accumulated value display to BenefitCard"
```

---

### Task 7: BenefitEditor — Rollover Fields

**Files:**
- Modify: `src/views/main/BenefitEditor.tsx:13-28,86-111,190-220`
- Test: `src/views/main/BenefitEditor.test.tsx`

- [ ] **Step 1: Write failing tests**

Add to `src/views/main/BenefitEditor.test.tsx`:

```typescript
it("shows rollover fields when resetType is calendar", () => {
  render(<BenefitEditor cardId="c1" onDone={vi.fn()} />);

  // Default resetType is "calendar"
  expect(screen.getByTestId("rollover-field")).toBeInTheDocument();
  expect(screen.getByTestId("rollover-input")).toBeInTheDocument();
});

it("hides rollover fields for non-calendar reset types", () => {
  render(<BenefitEditor cardId="c1" onDone={vi.fn()} />);

  fireEvent.change(screen.getByTestId("reset-type-select"), {
    target: { value: "anniversary" },
  });

  expect(screen.queryByTestId("rollover-field")).not.toBeInTheDocument();
});

it("shows max years input when rollover is checked", () => {
  render(<BenefitEditor cardId="c1" onDone={vi.fn()} />);

  fireEvent.click(screen.getByTestId("rollover-input"));
  expect(screen.getByTestId("rollover-max-years-input")).toBeInTheDocument();
});

it("saves rolloverable and rolloverMaxYears on submit", () => {
  const card = { id: "c1", owner: "X", cardTypeSlug: "", annualFee: 0, cardOpenDate: "2024-01-01", color: "#000", isEnabled: true, benefits: [] };
  useCardStore.setState({ cards: [card] });

  render(<BenefitEditor cardId="c1" onDone={vi.fn()} />);

  fireEvent.change(screen.getByTestId("name-input"), { target: { value: "Test" } });
  fireEvent.change(screen.getByTestId("face-value-input"), { target: { value: "100" } });
  fireEvent.click(screen.getByTestId("rollover-input"));
  fireEvent.change(screen.getByTestId("rollover-max-years-input"), { target: { value: "3" } });
  fireEvent.click(screen.getByTestId("submit-btn"));

  const benefits = useCardStore.getState().cards[0].benefits;
  expect(benefits[0].rolloverable).toBe(true);
  expect(benefits[0].rolloverMaxYears).toBe(3);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- --run src/views/main/BenefitEditor.test.tsx`
Expected: FAIL

- [ ] **Step 3: Update BenefitEditor form state and UI**

In `src/views/main/BenefitEditor.tsx`:

1. Add to `FormState`:
   ```typescript
   rolloverable: boolean;
   rolloverMaxYears: string;
   ```

2. Update `toFormState`:
   ```typescript
   rolloverable: benefit?.rolloverable ?? false,
   rolloverMaxYears: String(benefit?.rolloverMaxYears ?? 2),
   ```

3. Update `buildBenefit` to include rollover fields:
   ```typescript
   rolloverable: form.resetType === "calendar" ? form.rolloverable : false,
   rolloverMaxYears: form.rolloverable ? Number(form.rolloverMaxYears) : 2,
   ```

4. Add UI fields after the calendar-specific fields (after the `applicableMonths` section, still inside the `form.resetType === "calendar"` block):
   ```tsx
   <label data-testid="rollover-field">
     <input
       type="checkbox"
       checked={form.rolloverable}
       onChange={(e) => { handleChange("rolloverable", e.target.checked); }}
       data-testid="rollover-input"
     />
     可累积 (Rollover)
   </label>
   {form.rolloverable && (
     <label>
       累积上限 (年)
       <input
         type="number"
         min="1"
         max="10"
         value={form.rolloverMaxYears}
         onChange={(e) => { handleChange("rolloverMaxYears", e.target.value); }}
         data-testid="rollover-max-years-input"
       />
     </label>
   )}
   ```

- [ ] **Step 4: Run tests**

Run: `npm run test -- --run src/views/main/BenefitEditor.test.tsx`
Expected: PASS

- [ ] **Step 5: Run full suite**

Run: `npm run test -- --run`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add src/views/main/BenefitEditor.tsx src/views/main/BenefitEditor.test.tsx
git commit -m "add rollover checkbox and max years input to BenefitEditor"
```

---

### Task 8: BackfillDialog Component

**Files:**
- Create: `src/views/main/BackfillDialog.tsx`
- Create: `src/views/main/BackfillDialog.css`
- Create: `src/views/main/BackfillDialog.test.tsx`

- [ ] **Step 1: Write failing tests for BackfillDialog**

Create `src/views/main/BackfillDialog.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { CreditCard } from "../../models/types";
import { BackfillDialog } from "./BackfillDialog";

const makeCard = (): CreditCard => ({
  id: "c1",
  owner: "Test",
  cardTypeSlug: "amex_platinum",
  annualFee: 895,
  cardOpenDate: "2025-10-01",
  color: "#8E9EAF",
  isEnabled: true,
  benefits: [
    {
      id: "b1",
      name: "Dining Credit",
      description: "",
      faceValue: 100,
      category: "dining",
      resetType: "calendar",
      resetConfig: { period: "quarterly" },
      isHidden: false,
      autoRecur: false,
      rolloverable: false,
      rolloverMaxYears: 2,
      usageRecords: [],
    },
    {
      id: "b2",
      name: "FHR Credit",
      description: "",
      faceValue: 300,
      category: "hotel",
      resetType: "calendar",
      resetConfig: { period: "semi_annual" },
      isHidden: false,
      autoRecur: false,
      rolloverable: true,
      rolloverMaxYears: 2,
      usageRecords: [],
    },
  ],
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-04-25T12:00:00"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("BackfillDialog", () => {
  it("renders step 1 with non-rollover benefits and past periods", () => {
    const card = makeCard();
    render(<BackfillDialog card={card} onDone={vi.fn()} />);

    expect(screen.getByText("历史使用记录回填")).toBeInTheDocument();
    expect(screen.getByText(/Dining Credit/)).toBeInTheDocument();
  });

  it("can skip step 1 and go to step 2 for rollover benefits", () => {
    const card = makeCard();
    render(<BackfillDialog card={card} onDone={vi.fn()} />);

    fireEvent.click(screen.getByText("跳过"));
    expect(screen.getByText(/FHR Credit/)).toBeInTheDocument();
    expect(screen.getByText(/累积的 rollover 额度/)).toBeInTheDocument();
  });

  it("can complete the full flow and calls onDone", () => {
    const onDone = vi.fn();
    const card = makeCard();
    render(<BackfillDialog card={card} onDone={onDone} />);

    // Skip step 1
    fireEvent.click(screen.getByText("跳过"));
    // Skip step 2
    fireEvent.click(screen.getByText("跳过"));
    // Step 3: summary → done
    fireEvent.click(screen.getByText("完成"));

    expect(onDone).toHaveBeenCalled();
  });

  it("skips step 1 when all benefits are rollover-only", () => {
    const card = makeCard();
    card.benefits = card.benefits.filter((b) => b.rolloverable);
    render(<BackfillDialog card={card} onDone={vi.fn()} />);

    // Should jump straight to step 2
    expect(screen.getByText(/FHR Credit/)).toBeInTheDocument();
    expect(screen.getByText(/累积的 rollover 额度/)).toBeInTheDocument();
  });

  it("skips step 2 when no benefits are rolloverable", () => {
    const card = makeCard();
    card.benefits = card.benefits.filter((b) => !b.rolloverable);
    render(<BackfillDialog card={card} onDone={vi.fn()} />);

    // Skip step 1 → should go to step 3 (summary)
    fireEvent.click(screen.getByText("跳过"));
    expect(screen.getByText("完成")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- --run src/views/main/BackfillDialog.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Create BackfillDialog component**

Create `src/views/main/BackfillDialog.tsx`:

```typescript
import { useState } from "react";
import type { Benefit, CreditCard, UsageRecord } from "../../models/types";
import { useCardStore } from "../../stores/useCardStore";
import { getPastPeriods, generateRolloverRecords } from "../../utils/rollover";
import type { DateRange } from "../../utils/period";
import "./BackfillDialog.css";

interface BackfillDialogProps {
  card: CreditCard;
  onDone: () => void;
}

interface PeriodEntry {
  benefit: Benefit;
  period: DateRange;
  used: boolean;
  actualValue: string;
}

const PERIOD_LABEL: Record<string, (range: DateRange) => string> = {
  monthly: (r) => r.start.slice(0, 7),
  quarterly: (r) => {
    const month = Number(r.start.slice(5, 7));
    const q = Math.ceil(month / 3);
    return `${r.start.slice(0, 4)} Q${String(q)}`;
  },
  semi_annual: (r) => {
    const month = Number(r.start.slice(5, 7));
    return `${r.start.slice(0, 4)} ${month <= 6 ? "H1" : "H2"}`;
  },
  annual: (r) => r.start.slice(0, 4),
  every_4_years: (r) => `${r.start.slice(0, 4)}-${r.end.slice(0, 4)}`,
};

const formatPeriodLabel = (period: string, range: DateRange): string => {
  const fn = PERIOD_LABEL[period];
  return fn ? fn(range) : `${range.start} ~ ${range.end}`;
};

type Step = "non_rollover" | "rollover" | "summary";

const getSteps = (card: CreditCard): Step[] => {
  const hasNonRollover = card.benefits.some(
    (b) => !b.rolloverable && b.resetType === "calendar" && b.resetConfig.period,
  );
  const hasRollover = card.benefits.some((b) => b.rolloverable);

  const steps: Step[] = [];
  if (hasNonRollover) steps.push("non_rollover");
  if (hasRollover) steps.push("rollover");
  steps.push("summary");
  return steps;
};

export const BackfillDialog = ({ card, onDone }: BackfillDialogProps) => {
  const backfillBenefitUsage = useCardStore((s) => s.backfillBenefitUsage);
  const today = new Date();

  const steps = getSteps(card);
  const [stepIndex, setStepIndex] = useState(0);
  const currentStep = steps[stepIndex];

  // --- Step 1 state: non-rollover benefits ---
  const nonRolloverBenefits = card.benefits.filter(
    (b) => !b.rolloverable && b.resetType === "calendar" && b.resetConfig.period,
  );

  const [entries] = useState<PeriodEntry[]>(() => {
    const result: PeriodEntry[] = [];
    for (const b of nonRolloverBenefits) {
      const periods = getPastPeriods(b.resetConfig.period!, today, 12);
      for (const p of periods) {
        result.push({ benefit: b, period: p, used: false, actualValue: String(b.faceValue) });
      }
    }
    return result;
  });

  const setEntryUsed = (idx: number, used: boolean) => {
    entries[idx] = { ...entries[idx], used };
  };

  const setEntryValue = (idx: number, value: string) => {
    entries[idx] = { ...entries[idx], actualValue: value };
  };

  // --- Step 2 state: rollover benefits ---
  const rolloverBenefits = card.benefits.filter((b) => b.rolloverable);
  const [rolloverAmounts, setRolloverAmounts] = useState<Record<string, string>>(
    () => Object.fromEntries(rolloverBenefits.map((b) => [b.id, "0"])),
  );

  // --- Step tracking for summary ---
  const [committed, setCommitted] = useState(false);

  const commitStep1 = () => {
    for (const entry of entries) {
      if (entry.used) {
        const record: UsageRecord = {
          usedDate: entry.period.start,
          faceValue: entry.benefit.faceValue,
          actualValue: Number(entry.actualValue) || entry.benefit.faceValue,
        };
        backfillBenefitUsage(card.id, entry.benefit.id, [record]);
      }
    }
  };

  const commitStep2 = () => {
    for (const b of rolloverBenefits) {
      const amount = Number(rolloverAmounts[b.id] ?? 0);
      if (amount > 0) {
        const records = generateRolloverRecords(b, amount, today);
        if (records.length > 0) {
          backfillBenefitUsage(card.id, b.id, records);
        }
      }
    }
  };

  const handleNext = () => {
    if (currentStep === "non_rollover" && !committed) {
      commitStep1();
    }
    if (currentStep === "rollover" && !committed) {
      commitStep2();
    }
    if (stepIndex < steps.length - 1) {
      setStepIndex(stepIndex + 1);
    }
  };

  const handleSkip = () => {
    if (stepIndex < steps.length - 1) {
      setStepIndex(stepIndex + 1);
    }
  };

  const handleDone = () => {
    setCommitted(true);
    onDone();
  };

  return (
    <div className="backfill-dialog__overlay">
      <div className="backfill-dialog">
        <h3 className="backfill-dialog__title">历史使用记录回填</h3>
        <p className="backfill-dialog__step-indicator">
          步骤 {String(stepIndex + 1)} / {String(steps.length)}
        </p>

        {currentStep === "non_rollover" && (
          <div className="backfill-dialog__section">
            <p className="backfill-dialog__hint">
              请标记过去一年中已使用的权益，以便计算卡片回报率。
            </p>
            {entries.map((entry, idx) => (
              <div key={`${entry.benefit.id}-${entry.period.start}`} className="backfill-dialog__entry">
                <label className="backfill-dialog__entry-label">
                  <input
                    type="checkbox"
                    checked={entry.used}
                    onChange={(e) => { setEntryUsed(idx, e.target.checked); }}
                  />
                  <span className="backfill-dialog__benefit-name">{entry.benefit.name}</span>
                  <span className="backfill-dialog__period-label">
                    {formatPeriodLabel(entry.benefit.resetConfig.period!, entry.period)}
                  </span>
                </label>
                {entry.used && (
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={entry.actualValue}
                    onChange={(e) => { setEntryValue(idx, e.target.value); }}
                    className="backfill-dialog__value-input"
                    aria-label={`${entry.benefit.name} 实际金额`}
                  />
                )}
              </div>
            ))}
            <div className="backfill-dialog__actions">
              <button onClick={handleNext} className="backfill-dialog__btn backfill-dialog__btn--primary">
                下一步
              </button>
              <button onClick={handleSkip} className="backfill-dialog__btn">
                跳过
              </button>
            </div>
          </div>
        )}

        {currentStep === "rollover" && (
          <div className="backfill-dialog__section">
            <p className="backfill-dialog__hint">
              请输入截至当前累积的 rollover 额度。
            </p>
            {rolloverBenefits.map((b) => (
              <div key={b.id} className="backfill-dialog__entry">
                <label className="backfill-dialog__entry-label">
                  <span className="backfill-dialog__benefit-name">{b.name}</span>
                  <span className="backfill-dialog__period-label">
                    (${String(b.faceValue)}/{b.resetConfig.period ?? ""})
                  </span>
                </label>
                <div className="backfill-dialog__rollover-input-row">
                  <span>累积的 rollover 额度: $</span>
                  <input
                    type="number"
                    min="0"
                    step={b.faceValue}
                    value={rolloverAmounts[b.id] ?? "0"}
                    onChange={(e) => {
                      setRolloverAmounts((prev) => ({ ...prev, [b.id]: e.target.value }));
                    }}
                    className="backfill-dialog__value-input"
                    aria-label={`${b.name} rollover 额度`}
                  />
                </div>
              </div>
            ))}
            <div className="backfill-dialog__actions">
              <button onClick={handleNext} className="backfill-dialog__btn backfill-dialog__btn--primary">
                下一步
              </button>
              <button onClick={handleSkip} className="backfill-dialog__btn">
                跳过
              </button>
            </div>
          </div>
        )}

        {currentStep === "summary" && (
          <div className="backfill-dialog__section">
            <p className="backfill-dialog__hint">回填完成。</p>
            <div className="backfill-dialog__actions">
              <button onClick={handleDone} className="backfill-dialog__btn backfill-dialog__btn--primary">
                完成
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Create BackfillDialog CSS**

Create `src/views/main/BackfillDialog.css`:

```css
.backfill-dialog__overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.backfill-dialog {
  background: var(--bg-primary);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 24px;
  max-width: 480px;
  width: 90%;
  max-height: 70vh;
  overflow-y: auto;
}

.backfill-dialog__title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 4px;
}

.backfill-dialog__step-indicator {
  font-size: 12px;
  color: var(--text-tertiary);
  margin: 0 0 16px;
}

.backfill-dialog__hint {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0 0 12px;
}

.backfill-dialog__entry {
  padding: 8px 0;
  border-bottom: 1px solid var(--border-subtle);
}

.backfill-dialog__entry-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-primary);
}

.backfill-dialog__benefit-name {
  font-weight: 500;
}

.backfill-dialog__period-label {
  color: var(--text-secondary);
  font-size: 12px;
}

.backfill-dialog__value-input {
  width: 80px;
  padding: 4px 6px;
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 12px;
  text-align: right;
  margin-top: 4px;
}

.backfill-dialog__rollover-input-row {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: var(--text-secondary);
  margin-top: 6px;
}

.backfill-dialog__actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
  justify-content: flex-end;
}

.backfill-dialog__btn {
  padding: 8px 16px;
  border-radius: 8px;
  border: 1px solid var(--border-subtle);
  background: none;
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
}

.backfill-dialog__btn--primary {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}
```

- [ ] **Step 5: Run tests**

Run: `npm run test -- --run src/views/main/BackfillDialog.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/views/main/BackfillDialog.tsx src/views/main/BackfillDialog.css src/views/main/BackfillDialog.test.tsx
git commit -m "add BackfillDialog progressive modal for historical usage backfill"
```

---

### Task 9: Wire BackfillDialog into MainWindow

**Files:**
- Modify: `src/views/main/MainWindow.tsx:57-86`
- Test: `tests/e2e-flows.test.tsx`

- [ ] **Step 1: Add backfill state to MainWindow**

In `src/views/main/MainWindow.tsx`:

1. Import `BackfillDialog`:
   ```typescript
   import { BackfillDialog } from "./BackfillDialog";
   ```

2. Add state for tracking the newly created card that needs backfill:
   ```typescript
   const [backfillCardId, setBackfillCardId] = useState<string | null>(null);
   ```

3. Update the `onDone` callback for new card creation (the `else` branch at lines 74-81) to set the backfill card ID instead of navigating immediately:
   ```typescript
   onDone={() => {
     if (activeView.cardId) {
       setActiveView({ type: "card", cardId: activeView.cardId });
     } else {
       const latest = useCardStore.getState().cards;
       const newest = latest[latest.length - 1] as { id: string } | undefined;
       if (newest) {
         setBackfillCardId(newest.id);
         setActiveView({ type: "card", cardId: newest.id });
       } else {
         setActiveView("dashboard");
       }
     }
   }}
   ```

4. Render the BackfillDialog when `backfillCardId` is set. Add at the end of the return, after `</main>`:
   ```tsx
   {backfillCardId && (() => {
     const backfillCard = cards.find((c) => c.id === backfillCardId);
     if (!backfillCard) return null;
     // Only show if the card has past periods to backfill
     const hasPastPeriods = backfillCard.benefits.some(
       (b) => b.resetType === "calendar" && b.resetConfig.period,
     );
     if (!hasPastPeriods) return null;
     return (
       <BackfillDialog
         card={backfillCard}
         onDone={() => { setBackfillCardId(null); }}
       />
     );
   })()}
   ```

- [ ] **Step 2: Run full test suite**

Run: `npm run test -- --run`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add src/views/main/MainWindow.tsx
git commit -m "wire BackfillDialog into MainWindow after new card creation"
```

---

### Task 10: Lint, Full Test Suite, Final Verification

**Files:** All modified files

- [ ] **Step 1: Run linter**

Run: `npm run lint`
Expected: No errors

- [ ] **Step 2: Run full test suite**

Run: `npm run test -- --run`
Expected: ALL PASS

- [ ] **Step 3: Fix any issues found**

If lint or tests fail, fix the issues and re-run.

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix lint and test issues from rollover and backfill implementation"
```
