# Smart Auto-Replicate for Monthly Subscriptions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the rigid `autoRecur` behavior for monthly subscription benefits with a smart auto-replicate mode that copies the user's last recorded `actualValue` into the current month and lets the user edit or cancel it.

**Architecture:** One new utility helper (`resolveAutoRecurValue`), one new optional benefit field (`cancelledMonths`), and targeted modifications to `period.ts`, `useCardStore.ts`, and one UI tooltip. No new data migration required — existing auto-generated records remain valid under the new rules.

**Tech Stack:** React + TypeScript + Zustand + Vitest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-04-14-auto-replicate-subscription-design.md`

---

## File Structure

**Create:**
- `src/utils/subscription.ts` — `resolveAutoRecurValue` helper and `formatMonthKey` helper.
- `src/utils/subscription.test.ts` — unit tests for the helper.

**Modify:**
- `src/models/types.ts` — add optional `cancelledMonths?: string[]` field to `Benefit`.
- `src/utils/period.ts` — remove the `autoRecur` short-circuit in `isBenefitUsedInPeriod`; remove the `autoRecur` short-circuit in `getDeadline`.
- `src/utils/period.test.ts` — add regression tests for the removed short-circuits.
- `src/stores/useCardStore.ts` — rewrite `generateAutoRecurRecords` to use the helper and respect `cancelledMonths`; extend `setBenefitCycleUsed` to maintain `cancelledMonths`; remove the autoRecur skip in `getUnusedBenefitCount`.
- `src/stores/useCardStore.test.ts` — tests for the new `generateAutoRecurRecords` behavior and the `setBenefitCycleUsed` extension.
- `src/views/shared/BenefitCard.tsx` — add `title` tooltip to the "订阅·自动" period label span.
- `tests/store-integration.test.ts` — integration test for full replicate + cancel flow.

---

## Task 1: `resolveAutoRecurValue` helper + `formatMonthKey`

**Files:**
- Create: `src/utils/subscription.ts`
- Test: `src/utils/subscription.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/utils/subscription.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { resolveAutoRecurValue, formatMonthKey } from "./subscription";
import type { Benefit } from "../models/types";

const makeBenefit = (overrides: Partial<Benefit> = {}): Benefit => ({
  id: "b1",
  name: "Test",
  description: "",
  faceValue: 20,
  category: "streaming",
  resetType: "subscription",
  resetConfig: { period: "monthly" },
  isHidden: false,
  autoRecur: true,
  rolloverable: false,
  rolloverMaxYears: 0,
  usageRecords: [],
  ...overrides,
});

describe("resolveAutoRecurValue", () => {
  it("returns the most-recent record's actualValue when records exist", () => {
    const benefit = makeBenefit({
      faceValue: 20,
      usageRecords: [
        { usedDate: "2026-02-01", faceValue: 20, actualValue: 15 },
        { usedDate: "2026-03-01", faceValue: 20, actualValue: 12 },
        { usedDate: "2026-01-01", faceValue: 20, actualValue: 20 },
      ],
    });
    expect(resolveAutoRecurValue(benefit)).toBe(12);
  });

  it("returns faceValue when no records exist", () => {
    const benefit = makeBenefit({ faceValue: 20, usageRecords: [] });
    expect(resolveAutoRecurValue(benefit)).toBe(20);
  });

  it("ignores record array order — sorts by usedDate descending", () => {
    const benefit = makeBenefit({
      faceValue: 20,
      usageRecords: [
        { usedDate: "2026-03-01", faceValue: 20, actualValue: 5 },
        { usedDate: "2026-01-01", faceValue: 20, actualValue: 99 },
      ],
    });
    expect(resolveAutoRecurValue(benefit)).toBe(5);
  });
});

describe("formatMonthKey", () => {
  it("formats Date as YYYY-MM", () => {
    expect(formatMonthKey(new Date(2026, 3, 14))).toBe("2026-04");
  });

  it("pads single-digit months", () => {
    expect(formatMonthKey(new Date(2026, 0, 1))).toBe("2026-01");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/utils/subscription.test.ts`
Expected: FAIL with "Failed to resolve import './subscription'".

- [ ] **Step 3: Create the helper**

Create `src/utils/subscription.ts`:

```ts
import type { Benefit } from "../models/types";

/** Returns YYYY-MM key for a given date. */
export const formatMonthKey = (d: Date): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${String(year)}-${month}`;
};

/**
 * Resolves the actualValue to use when auto-inserting a new subscription record.
 * Returns the most-recent-by-usedDate record's actualValue, or the benefit's
 * faceValue if no records exist.
 */
export const resolveAutoRecurValue = (benefit: Benefit): number => {
  if (benefit.usageRecords.length === 0) return benefit.faceValue;
  const sorted = [...benefit.usageRecords].sort((a, b) =>
    b.usedDate.localeCompare(a.usedDate),
  );
  return sorted[0].actualValue;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/utils/subscription.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: no errors on the new files.

- [ ] **Step 6: Commit**

```bash
git add src/utils/subscription.ts src/utils/subscription.test.ts
git commit -m "add resolveAutoRecurValue helper for smart replication"
```

---

## Task 2: Add `cancelledMonths` field to `Benefit`

**Files:**
- Modify: `src/models/types.ts:68-81`

- [ ] **Step 1: Add the field**

Edit `src/models/types.ts`, changing the `Benefit` interface:

```ts
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
  /**
   * Months (YYYY-MM) where the user explicitly cancelled the auto-replicate
   * record for a monthly autoRecur subscription. Only meaningful when
   * resetType === "subscription" && autoRecur === true && resetConfig.period === "monthly".
   */
  cancelledMonths?: string[];
}
```

- [ ] **Step 2: Run typecheck + tests to verify nothing regressed**

Run: `npm run test`
Expected: all existing tests pass (optional field, no callers broken).

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/models/types.ts
git commit -m "add optional cancelledMonths field to Benefit"
```

---

## Task 3: Remove `autoRecur` short-circuits from `period.ts`

**Files:**
- Modify: `src/utils/period.ts:138-168` (remove short-circuit in `isBenefitUsedInPeriod`)
- Modify: `src/utils/period.ts:193-208` (remove short-circuit in `getDeadline`)
- Test: `src/utils/period.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/utils/period.test.ts` inside a new `describe` block at the end of the file (use the existing test file's imports and helpers — adjust if the file already imports `Benefit` and `formatDate`):

```ts
describe("autoRecur monthly subscription — new behavior", () => {
  const today = new Date(2026, 3, 14); // 2026-04-14

  const makeSubBenefit = (records: { usedDate: string; actualValue: number }[] = []): Benefit => ({
    id: "b",
    name: "Netflix",
    description: "",
    faceValue: 20,
    category: "streaming",
    resetType: "subscription",
    resetConfig: { period: "monthly" },
    isHidden: false,
    autoRecur: true,
    rolloverable: false,
    rolloverMaxYears: 0,
    usageRecords: records.map((r) => ({ ...r, faceValue: 20 })),
  });

  it("isBenefitUsedInPeriod returns false when current month has no record (regression: previously true)", () => {
    const benefit = makeSubBenefit([]);
    expect(isBenefitUsedInPeriod(benefit, today)).toBe(false);
  });

  it("isBenefitUsedInPeriod returns true when current month has a record", () => {
    const benefit = makeSubBenefit([{ usedDate: "2026-04-01", actualValue: 15 }]);
    expect(isBenefitUsedInPeriod(benefit, today)).toBe(true);
  });

  it("getDeadline returns end-of-month for autoRecur monthly subscription (regression: previously null)", () => {
    expect(
      getDeadline(today, {
        resetType: "subscription",
        resetConfig: { period: "monthly" },
        autoRecur: true,
      }),
    ).toBe("2026-04-30");
  });
});
```

If `Benefit`, `isBenefitUsedInPeriod`, `getDeadline` are not already imported in the test file, add them to the existing imports at the top.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/utils/period.test.ts`
Expected: FAIL — the two "returns false" / "returns end-of-month" cases fail because the current code short-circuits to `true` / `null`.

- [ ] **Step 3: Remove the short-circuits**

Edit `src/utils/period.ts`.

In `isBenefitUsedInPeriod`, delete these three lines (currently at lines 149-151):

```ts
  if (resetType === "subscription" && autoRecur) {
    return true;
  }
```

Also remove `autoRecur` from the destructure on line 143 if it is no longer used elsewhere in the function. After the edit, line 143 reads:

```ts
  const { resetType, resetConfig, usageRecords } = benefit;
```

In `getDeadline`, delete these two lines (currently at lines 196-197):

```ts
  if (input.resetType === "subscription" && input.autoRecur) return null;
```

Leave the `autoRecur?: boolean` field in `DeadlineInput` — callers still pass it; the field becomes inert but removing it is a larger ripple. (YAGNI: leave it.)

- [ ] **Step 4: Run tests to verify they pass and no existing tests regressed**

Run: `npm run test -- src/utils/period.test.ts`
Expected: PASS.

Run: `npm run test`
Expected: some existing tests elsewhere may fail (tests that asserted autoRecur was treated as always-used). If so, they are documenting the OLD behavior and must be updated to match the NEW spec. Fix each case by either asserting the new correct behavior or removing the test if it is purely redundant. Re-run until green.

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/utils/period.ts src/utils/period.test.ts
git commit -m "remove autoRecur short-circuits from isBenefitUsedInPeriod and getDeadline"
```

---

## Task 4: Rewrite `generateAutoRecurRecords` and remove autoRecur skip in `getUnusedBenefitCount`

**Files:**
- Modify: `src/stores/useCardStore.ts:283-310` (`generateAutoRecurRecords`)
- Modify: `src/stores/useCardStore.ts:226-241` (`getUnusedBenefitCount`)
- Test: `src/stores/useCardStore.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/stores/useCardStore.test.ts` inside a new `describe` block at the end of the file:

```ts
describe("generateAutoRecurRecords — smart replication", () => {
  beforeEach(() => {
    useCardStore.setState({ cards: [], settings: {
      logLevel: "info",
      debugLogEnabled: false,
      reminderEnabled: true,
      reminderDays: 3,
      dismissedDate: null,
    }});
  });

  it("inserts current month record using previous month's actualValue", () => {
    const today = new Date();
    const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastMonthIso = `${String(lastMonth.getFullYear())}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}-01`;

    const benefit: Benefit = {
      id: "b", name: "Netflix", description: "", faceValue: 20,
      category: "streaming", resetType: "subscription",
      resetConfig: { period: "monthly" },
      isHidden: false, autoRecur: true, rolloverable: false, rolloverMaxYears: 0,
      usageRecords: [{ usedDate: lastMonthIso, faceValue: 20, actualValue: 13 }],
    };
    const card: CreditCard = {
      id: "c", owner: "me", cardTypeSlug: "x", annualFee: 0,
      cardOpenDate: "2024-01-01", color: "#000", isEnabled: true, benefits: [benefit],
    };
    useCardStore.setState({ cards: [card] });

    useCardStore.getState().generateAutoRecurRecords();

    const updated = useCardStore.getState().cards[0].benefits[0];
    expect(updated.usageRecords).toHaveLength(2);
    const thisMonthRecord = updated.usageRecords.find(
      (r) => r.usedDate.startsWith(`${String(today.getFullYear())}-${String(today.getMonth() + 1).padStart(2, "0")}`),
    );
    expect(thisMonthRecord?.actualValue).toBe(13);
  });

  it("falls back to faceValue when no prior records exist", () => {
    const benefit: Benefit = {
      id: "b", name: "Netflix", description: "", faceValue: 20,
      category: "streaming", resetType: "subscription",
      resetConfig: { period: "monthly" },
      isHidden: false, autoRecur: true, rolloverable: false, rolloverMaxYears: 0,
      usageRecords: [],
    };
    const card: CreditCard = {
      id: "c", owner: "me", cardTypeSlug: "x", annualFee: 0,
      cardOpenDate: "2024-01-01", color: "#000", isEnabled: true, benefits: [benefit],
    };
    useCardStore.setState({ cards: [card] });

    useCardStore.getState().generateAutoRecurRecords();

    const updated = useCardStore.getState().cards[0].benefits[0];
    expect(updated.usageRecords).toHaveLength(1);
    expect(updated.usageRecords[0].actualValue).toBe(20);
  });

  it("does not insert when current month is in cancelledMonths", () => {
    const today = new Date();
    const monthKey = `${String(today.getFullYear())}-${String(today.getMonth() + 1).padStart(2, "0")}`;

    const benefit: Benefit = {
      id: "b", name: "Netflix", description: "", faceValue: 20,
      category: "streaming", resetType: "subscription",
      resetConfig: { period: "monthly" },
      isHidden: false, autoRecur: true, rolloverable: false, rolloverMaxYears: 0,
      usageRecords: [],
      cancelledMonths: [monthKey],
    };
    const card: CreditCard = {
      id: "c", owner: "me", cardTypeSlug: "x", annualFee: 0,
      cardOpenDate: "2024-01-01", color: "#000", isEnabled: true, benefits: [benefit],
    };
    useCardStore.setState({ cards: [card] });

    useCardStore.getState().generateAutoRecurRecords();

    const updated = useCardStore.getState().cards[0].benefits[0];
    expect(updated.usageRecords).toHaveLength(0);
  });

  it("ignores non-monthly autoRecur subscriptions", () => {
    const benefit: Benefit = {
      id: "b", name: "Yearly Sub", description: "", faceValue: 100,
      category: "streaming", resetType: "subscription",
      resetConfig: { period: "annual" },
      isHidden: false, autoRecur: true, rolloverable: false, rolloverMaxYears: 0,
      usageRecords: [],
    };
    const card: CreditCard = {
      id: "c", owner: "me", cardTypeSlug: "x", annualFee: 0,
      cardOpenDate: "2024-01-01", color: "#000", isEnabled: true, benefits: [benefit],
    };
    useCardStore.setState({ cards: [card] });

    useCardStore.getState().generateAutoRecurRecords();

    const updated = useCardStore.getState().cards[0].benefits[0];
    expect(updated.usageRecords).toHaveLength(0);
  });
});

describe("getUnusedBenefitCount — autoRecur subscriptions now countable", () => {
  beforeEach(() => {
    useCardStore.setState({ cards: [] });
  });

  it("counts autoRecur monthly subscription as unused when current month has no record", () => {
    const benefit: Benefit = {
      id: "b", name: "Netflix", description: "", faceValue: 20,
      category: "streaming", resetType: "subscription",
      resetConfig: { period: "monthly" },
      isHidden: false, autoRecur: true, rolloverable: false, rolloverMaxYears: 0,
      usageRecords: [],
    };
    const card: CreditCard = {
      id: "c", owner: "me", cardTypeSlug: "x", annualFee: 0,
      cardOpenDate: "2024-01-01", color: "#000", isEnabled: true, benefits: [benefit],
    };
    useCardStore.setState({ cards: [card] });

    expect(useCardStore.getState().getUnusedBenefitCount()).toBe(1);
  });
});
```

Add imports at the top of the file if missing:

```ts
import type { Benefit, CreditCard } from "../models/types";
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/stores/useCardStore.test.ts`
Expected: the 5 new tests fail (actualValue=20 instead of 13 because old code uses faceValue; cancelledMonths branch not honored; unused-count returns 0).

- [ ] **Step 3: Update `generateAutoRecurRecords` to use the helper and honor cancelledMonths**

Edit `src/stores/useCardStore.ts`.

Add imports at the top:

```ts
import { resolveAutoRecurValue, formatMonthKey } from "../utils/subscription";
```

Replace the body of `generateAutoRecurRecords` (currently lines 283-310) with:

```ts
  generateAutoRecurRecords: () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth() + 1;
    const monthRange = getMonthRange(year, month);
    const monthKey = formatMonthKey(today);

    set((state) => ({
      cards: state.cards.map((card) => ({
        ...card,
        benefits: card.benefits.map((benefit) => {
          if (benefit.resetType !== "subscription" || !benefit.autoRecur) return benefit;
          if (benefit.resetConfig.period !== "monthly") return benefit;
          if (benefit.cancelledMonths?.includes(monthKey)) return benefit;

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

- [ ] **Step 4: Remove autoRecur skip in `getUnusedBenefitCount`**

In `src/stores/useCardStore.ts` inside `getUnusedBenefitCount` (currently line 234), delete this line:

```ts
        if (benefit.resetType === "subscription" && benefit.autoRecur) continue;
```

The remaining checks (`isBenefitUsedInPeriod`, `isApplicableNow`, `isHidden`) now correctly handle the autoRecur case because `isBenefitUsedInPeriod` no longer short-circuits.

- [ ] **Step 5: Run tests to verify they pass and nothing regressed**

Run: `npm run test`
Expected: all tests pass. If older tests asserted "autoRecur subscriptions are never counted as unused" or "generateAutoRecurRecords inserts faceValue", update them to match the new spec.

- [ ] **Step 6: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/stores/useCardStore.ts src/stores/useCardStore.test.ts
git commit -m "smart replication: autoRecur uses last actualValue, honors cancelledMonths, countable when cancelled"
```

---

## Task 5: Maintain `cancelledMonths` in `setBenefitCycleUsed`

**Files:**
- Modify: `src/stores/useCardStore.ts:155-192` (`setBenefitCycleUsed`)
- Test: `src/stores/useCardStore.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/stores/useCardStore.test.ts`:

```ts
describe("setBenefitCycleUsed — cancelledMonths maintenance for autoRecur subs", () => {
  beforeEach(() => {
    useCardStore.setState({ cards: [] });
  });

  const setupMonthlyAutoRecur = () => {
    const today = new Date();
    const monthStart = `${String(today.getFullYear())}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const monthEndIso = `${String(today.getFullYear())}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(monthEnd.getDate()).padStart(2, "0")}`;
    const monthKey = `${String(today.getFullYear())}-${String(today.getMonth() + 1).padStart(2, "0")}`;

    const benefit: Benefit = {
      id: "b", name: "Netflix", description: "", faceValue: 20,
      category: "streaming", resetType: "subscription",
      resetConfig: { period: "monthly" },
      isHidden: false, autoRecur: true, rolloverable: false, rolloverMaxYears: 0,
      usageRecords: [{ usedDate: monthStart, faceValue: 20, actualValue: 13 }],
    };
    const card: CreditCard = {
      id: "c", owner: "me", cardTypeSlug: "x", annualFee: 0,
      cardOpenDate: "2024-01-01", color: "#000", isEnabled: true, benefits: [benefit],
    };
    useCardStore.setState({ cards: [card] });
    return { monthStart, monthEnd: monthEndIso, monthKey };
  };

  it("uncheck (used=false) on current month of monthly autoRecur adds monthKey to cancelledMonths", () => {
    const { monthStart, monthEnd, monthKey } = setupMonthlyAutoRecur();

    useCardStore.getState().setBenefitCycleUsed("c", "b", monthStart, monthEnd, false);

    const updated = useCardStore.getState().cards[0].benefits[0];
    expect(updated.cancelledMonths).toEqual([monthKey]);
    expect(updated.usageRecords).toHaveLength(0);
  });

  it("check (used=true) on current month of monthly autoRecur removes monthKey from cancelledMonths", () => {
    const { monthStart, monthEnd, monthKey } = setupMonthlyAutoRecur();
    // Seed cancelled state + no record.
    useCardStore.setState((state) => ({
      cards: state.cards.map((c) => ({
        ...c,
        benefits: c.benefits.map((b) => ({ ...b, usageRecords: [], cancelledMonths: [monthKey] })),
      })),
    }));

    useCardStore.getState().setBenefitCycleUsed("c", "b", monthStart, monthEnd, true);

    const updated = useCardStore.getState().cards[0].benefits[0];
    expect(updated.cancelledMonths).toEqual([]);
    expect(updated.usageRecords).toHaveLength(1);
  });

  it("uncheck on non-monthly autoRecur subscription does not touch cancelledMonths", () => {
    const today = new Date();
    const yearStart = `${String(today.getFullYear())}-01-01`;
    const yearEnd = `${String(today.getFullYear())}-12-31`;

    const benefit: Benefit = {
      id: "b", name: "YearlySub", description: "", faceValue: 100,
      category: "streaming", resetType: "subscription",
      resetConfig: { period: "annual" },
      isHidden: false, autoRecur: true, rolloverable: false, rolloverMaxYears: 0,
      usageRecords: [{ usedDate: yearStart, faceValue: 100, actualValue: 100 }],
    };
    const card: CreditCard = {
      id: "c", owner: "me", cardTypeSlug: "x", annualFee: 0,
      cardOpenDate: "2024-01-01", color: "#000", isEnabled: true, benefits: [benefit],
    };
    useCardStore.setState({ cards: [card] });

    useCardStore.getState().setBenefitCycleUsed("c", "b", yearStart, yearEnd, false);

    const updated = useCardStore.getState().cards[0].benefits[0];
    expect(updated.cancelledMonths).toBeUndefined();
    expect(updated.usageRecords).toHaveLength(0);
  });

  it("uncheck on prior-month cycle of monthly autoRecur does not add monthKey for that prior month (only current month is tracked)", () => {
    const today = new Date();
    const lastMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastMonthStart = `${String(lastMonthDate.getFullYear())}-${String(lastMonthDate.getMonth() + 1).padStart(2, "0")}-01`;
    const lastMonthEndDay = new Date(lastMonthDate.getFullYear(), lastMonthDate.getMonth() + 1, 0).getDate();
    const lastMonthEnd = `${String(lastMonthDate.getFullYear())}-${String(lastMonthDate.getMonth() + 1).padStart(2, "0")}-${String(lastMonthEndDay).padStart(2, "0")}`;

    const benefit: Benefit = {
      id: "b", name: "Netflix", description: "", faceValue: 20,
      category: "streaming", resetType: "subscription",
      resetConfig: { period: "monthly" },
      isHidden: false, autoRecur: true, rolloverable: false, rolloverMaxYears: 0,
      usageRecords: [{ usedDate: lastMonthStart, faceValue: 20, actualValue: 15 }],
    };
    const card: CreditCard = {
      id: "c", owner: "me", cardTypeSlug: "x", annualFee: 0,
      cardOpenDate: "2024-01-01", color: "#000", isEnabled: true, benefits: [benefit],
    };
    useCardStore.setState({ cards: [card] });

    useCardStore.getState().setBenefitCycleUsed("c", "b", lastMonthStart, lastMonthEnd, false);

    const updated = useCardStore.getState().cards[0].benefits[0];
    // Prior-month uncheck does not taint cancelledMonths for current month;
    // record was still removed though.
    expect(updated.cancelledMonths ?? []).toEqual([]);
    expect(updated.usageRecords).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/stores/useCardStore.test.ts`
Expected: 4 new tests fail — current implementation does not touch `cancelledMonths`.

- [ ] **Step 3: Extend `setBenefitCycleUsed`**

In `src/stores/useCardStore.ts`, replace the body of `setBenefitCycleUsed` (lines 155-192) with:

```ts
  setBenefitCycleUsed: (cardId, benefitId, cycleStart, cycleEnd, used, opts) => {
    set((state) => {
      const card = state.cards.find((c) => c.id === cardId);
      if (!card) return state;
      const benefit = card.benefits.find((b) => b.id === benefitId);
      if (!benefit) return state;

      const existingInCycle = benefit.usageRecords.find(
        (r) => r.usedDate >= cycleStart && r.usedDate <= cycleEnd,
      );

      // Determine if we should also maintain cancelledMonths.
      // Only monthly autoRecur subscriptions track cancellation, and only for
      // the cycle that equals the CURRENT month (which is the only cycle
      // `generateAutoRecurRecords` ever inserts into).
      const today = new Date();
      const currentMonthKey = formatMonthKey(today);
      const cycleMonthKey = cycleStart.slice(0, 7); // "YYYY-MM"
      const isMonthlyAutoRecurSub =
        benefit.resetType === "subscription" &&
        benefit.autoRecur &&
        benefit.resetConfig.period === "monthly";
      const tracksCancellation = isMonthlyAutoRecurSub && cycleMonthKey === currentMonthKey;

      const applyCancelledMonths = (b: Benefit): Benefit => {
        if (!tracksCancellation) return b;
        const current = b.cancelledMonths ?? [];
        if (used) {
          const next = current.filter((m) => m !== currentMonthKey);
          return { ...b, cancelledMonths: next };
        }
        if (current.includes(currentMonthKey)) return { ...b, cancelledMonths: current };
        return { ...b, cancelledMonths: [...current, currentMonthKey] };
      };

      if (used) {
        if (existingInCycle) {
          return {
            cards: updateBenefitInCards(state.cards, cardId, benefitId, (b) => applyCancelledMonths(b)),
          };
        }
        const todayIso = formatDate(new Date());
        const defaultDate =
          todayIso >= cycleStart && todayIso <= cycleEnd ? todayIso : cycleStart;
        const newRecord: UsageRecord = {
          usedDate: opts?.usedDate ?? defaultDate,
          faceValue: benefit.faceValue,
          actualValue: opts?.actualValue ?? benefit.faceValue,
        };
        return {
          cards: updateBenefitInCards(state.cards, cardId, benefitId, (b) =>
            applyCancelledMonths({ ...b, usageRecords: [...b.usageRecords, newRecord] }),
          ),
        };
      }

      if (!existingInCycle) {
        return {
          cards: updateBenefitInCards(state.cards, cardId, benefitId, (b) => applyCancelledMonths(b)),
        };
      }
      return {
        cards: updateBenefitInCards(state.cards, cardId, benefitId, (b) =>
          applyCancelledMonths({
            ...b,
            usageRecords: b.usageRecords.filter((r) => r !== existingInCycle),
          }),
        ),
      };
    });
  },
```

`formatMonthKey` is already imported in Task 4.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/stores/useCardStore.test.ts`
Expected: all 4 new tests pass, no regressions.

Run: `npm run test`
Expected: full suite green.

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/stores/useCardStore.ts src/stores/useCardStore.test.ts
git commit -m "track cancelledMonths in setBenefitCycleUsed for monthly autoRecur subs"
```

---

## Task 6: UI tooltip on "订阅·自动" + integration test

**Files:**
- Modify: `src/views/shared/BenefitCard.tsx` — add `title` attribute to the period-label span.
- Test: `tests/store-integration.test.ts` (new describe block)

- [ ] **Step 1: Write the failing integration test**

Append a new describe block to `tests/store-integration.test.ts`:

```ts
describe("auto-replicate subscription flow", () => {
  beforeEach(() => {
    useCardStore.setState({ cards: [] });
  });

  it("replicates previous month's actualValue + user can cancel + cancellation does not resurrect on re-run", () => {
    const today = new Date();
    const yr = today.getFullYear();
    const mo = today.getMonth() + 1;
    const monthStart = `${String(yr)}-${String(mo).padStart(2, "0")}-01`;
    const lastMonthDate = new Date(yr, mo - 2, 1);
    const lastMonthStart = `${String(lastMonthDate.getFullYear())}-${String(lastMonthDate.getMonth() + 1).padStart(2, "0")}-01`;
    const monthEndDay = new Date(yr, mo, 0).getDate();
    const monthEnd = `${String(yr)}-${String(mo).padStart(2, "0")}-${String(monthEndDay).padStart(2, "0")}`;
    const monthKey = `${String(yr)}-${String(mo).padStart(2, "0")}`;

    const benefit: Benefit = {
      id: "b", name: "Netflix", description: "", faceValue: 20,
      category: "streaming", resetType: "subscription",
      resetConfig: { period: "monthly" },
      isHidden: false, autoRecur: true, rolloverable: false, rolloverMaxYears: 0,
      usageRecords: [{ usedDate: lastMonthStart, faceValue: 20, actualValue: 13 }],
    };
    const card: CreditCard = {
      id: "c", owner: "me", cardTypeSlug: "x", annualFee: 0,
      cardOpenDate: "2024-01-01", color: "#000", isEnabled: true, benefits: [benefit],
    };
    useCardStore.setState({ cards: [card] });

    // Step 1: generate replicates 13, not faceValue 20.
    useCardStore.getState().generateAutoRecurRecords();
    let updated = useCardStore.getState().cards[0].benefits[0];
    expect(updated.usageRecords).toHaveLength(2);
    expect(
      updated.usageRecords.find((r) => r.usedDate === monthStart)?.actualValue,
    ).toBe(13);

    // Step 2: user unchecks current month.
    useCardStore.getState().setBenefitCycleUsed("c", "b", monthStart, monthEnd, false);
    updated = useCardStore.getState().cards[0].benefits[0];
    expect(updated.cancelledMonths).toEqual([monthKey]);
    expect(updated.usageRecords.some((r) => r.usedDate === monthStart)).toBe(false);

    // Step 3: generate runs again → no resurrection.
    useCardStore.getState().generateAutoRecurRecords();
    updated = useCardStore.getState().cards[0].benefits[0];
    expect(updated.usageRecords.some((r) => r.usedDate === monthStart)).toBe(false);

    // Step 4: user re-checks → cancellation cleared, record restored.
    useCardStore.getState().setBenefitCycleUsed("c", "b", monthStart, monthEnd, true);
    updated = useCardStore.getState().cards[0].benefits[0];
    expect(updated.cancelledMonths).toEqual([]);
    expect(updated.usageRecords.some((r) => r.usedDate === monthStart)).toBe(true);
  });
});
```

If `Benefit`, `CreditCard`, `useCardStore` are not already imported in the file, add them.

- [ ] **Step 2: Run test to verify it passes**

Run: `npm run test -- tests/store-integration.test.ts`
Expected: PASS (all behavior was already implemented in Tasks 3-5; this is end-to-end verification).

- [ ] **Step 3: Add the tooltip to the UI label**

Open `src/views/shared/BenefitCard.tsx`. Locate the `benefit-card__period` span (currently line 104):

```tsx
        <span className="benefit-card__period">{periodLabel ?? getResetLabel(benefit)}</span>
```

Replace with:

```tsx
        <span
          className="benefit-card__period"
          title={
            benefit.resetType === "subscription" && benefit.autoRecur
              ? "自动填充上月金额，可修改或取消"
              : undefined
          }
        >
          {periodLabel ?? getResetLabel(benefit)}
        </span>
```

- [ ] **Step 4: Run full test suite**

Run: `npm run test`
Expected: all tests pass, including the new integration test and any existing BenefitCard tests (the `title` attribute addition is additive and should not break anything).

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/views/shared/BenefitCard.tsx tests/store-integration.test.ts
git commit -m "add auto-replicate tooltip + end-to-end replication/cancel integration test"
```

---

## Self-Review Complete

- Spec coverage: all requirements (replicate last actualValue, editable via existing per-cycle toggle, cancel suppression via `cancelledMonths`, reminder via end-of-month deadline, `getUnusedBenefitCount` now counts, tooltip, no migration) map to tasks.
- No placeholders.
- Type consistency: `resolveAutoRecurValue`, `formatMonthKey`, `cancelledMonths`, `setBenefitCycleUsed` signatures match across tasks.
- DeadlineInput still accepts `autoRecur?` (documented as inert — YAGNI).
