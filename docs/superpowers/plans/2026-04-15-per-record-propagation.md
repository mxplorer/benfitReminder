# Per-Record Propagation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace benefit-level `autoRecur` + `cancelledMonths` with per-record `UsageRecord.propagateNext`, surface the decision inline in the usage prompt, and add focus/midnight triggers so today-dependent state stays fresh.

**Architecture:** Additive-first. Introduce `propagateNext` and a store `now` alongside the existing `autoRecur` model, migrate legacy data at import time, rewrite generation to use the new model, then strip `autoRecur`/`cancelledMonths` last. Each task keeps the test suite green.

**Tech Stack:** TypeScript, Zustand, React, Vitest, React Testing Library.

**Spec:** `docs/superpowers/specs/2026-04-15-per-record-propagation-design.md`

---

## Task 1: Extend types — add `propagateNext` and store `now`

**Files:**
- Modify: `src/models/types.ts` (add `propagateNext?` to `UsageRecord`)
- Modify: `src/stores/useCardStore.ts` (add `now: Date` to `CardStoreState`)
- Test: `src/models/types.test.ts`

- [ ] **Step 1: Write failing test for UsageRecord shape**

Append to `src/models/types.test.ts`:

```ts
describe("UsageRecord.propagateNext", () => {
  it("accepts propagateNext=true", () => {
    const r: UsageRecord = {
      usedDate: "2026-03-01",
      faceValue: 25,
      actualValue: 25,
      propagateNext: true,
    };
    expect(r.propagateNext).toBe(true);
  });

  it("accepts propagateNext omitted", () => {
    const r: UsageRecord = { usedDate: "2026-03-01", faceValue: 25, actualValue: 25 };
    expect(r.propagateNext).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/models/types.test.ts`
Expected: compile error — `propagateNext` not assignable to `UsageRecord`.

- [ ] **Step 3: Add `propagateNext` to `UsageRecord`**

In `src/models/types.ts`, modify the `UsageRecord` interface:

```ts
export interface UsageRecord {
  usedDate: string;
  faceValue: number;
  actualValue: number;
  isRollover?: boolean;
  /** For monthly subscription / calendar-monthly benefits: if true, app
   * auto-creates next month's record copying this record's actualValue. */
  propagateNext?: boolean;
}
```

- [ ] **Step 4: Add `now` to store state**

In `src/stores/useCardStore.ts`, modify `CardStoreState`:

```ts
interface CardStoreState {
  cards: CreditCard[];
  settings: AppSettings;
  /** "Current moment" the UI reads for today-dependent calculations.
   * Bumped by `recalculate()` so focus/midnight refreshes re-render. */
  now: Date;
}
```

And in the `create<…>()` initializer, add `now: new Date(),` next to `cards` and `settings`.

- [ ] **Step 5: Run full test suite**

Run: `npm run test`
Expected: all tests pass (the new field is optional; adding `now` to initial state does not affect existing selectors).

- [ ] **Step 6: Commit**

```bash
git add src/models/types.ts src/models/types.test.ts src/stores/useCardStore.ts
git commit -m "add UsageRecord.propagateNext and store.now (additive)"
```

---

## Task 2: Migration — legacy `autoRecur` → `propagateNext`

**Files:**
- Modify: `src/utils/migrations.ts`
- Modify: `src/utils/migrations.test.ts`

- [ ] **Step 1: Write failing test**

Append to `src/utils/migrations.test.ts`:

```ts
describe("migrateCards - autoRecur → propagateNext", () => {
  it("sets propagateNext=true on monthly records for autoRecur=true benefits, except cancelledMonths", () => {
    const benefit = makeBenefit({
      name: "$25/mo Digital",
      resetType: "subscription",
      resetConfig: {},
      autoRecur: true,
      cancelledMonths: ["2026-02"],
      usageRecords: [
        { usedDate: "2026-01-05", faceValue: 25, actualValue: 25 },
        { usedDate: "2026-02-10", faceValue: 25, actualValue: 20 },
        { usedDate: "2026-03-03", faceValue: 25, actualValue: 25 },
      ],
    });
    const [card] = migrateCards([makeCard([benefit])]);
    const [r1, r2, r3] = card.benefits[0].usageRecords;
    expect(r1.propagateNext).toBe(true);
    expect(r2.propagateNext).toBeUndefined(); // in cancelledMonths
    expect(r3.propagateNext).toBe(true);
    expect(card.benefits[0].autoRecur).toBeUndefined();
    expect(card.benefits[0].cancelledMonths).toBeUndefined();
  });

  it("drops autoRecur=false without touching records", () => {
    const benefit = makeBenefit({
      resetType: "subscription",
      autoRecur: false,
      usageRecords: [{ usedDate: "2026-01-05", faceValue: 25, actualValue: 25 }],
    });
    const [card] = migrateCards([makeCard([benefit])]);
    expect(card.benefits[0].autoRecur).toBeUndefined();
    expect(card.benefits[0].usageRecords[0].propagateNext).toBeUndefined();
  });

  it("is idempotent on already-migrated data", () => {
    const benefit = makeBenefit({
      resetType: "subscription",
      usageRecords: [
        { usedDate: "2026-03-01", faceValue: 25, actualValue: 25, propagateNext: true },
      ],
    });
    const once = migrateCards([makeCard([benefit])]);
    const twice = migrateCards(once);
    expect(twice).toEqual(once);
  });
});
```

Also extend `makeBenefit` at the top of the file to accept `autoRecur` and `cancelledMonths`:

```ts
const makeBenefit = (overrides: Partial<Benefit> = {}): Benefit => ({
  id: "b1",
  name: "benefit",
  description: "",
  faceValue: 0,
  category: "other",
  resetType: "one_time",
  resetConfig: {},
  isHidden: false,
  autoRecur: false,
  rolloverable: false,
  rolloverMaxYears: 0,
  usageRecords: [],
  ...overrides,
});
```

(Leave as-is if already correct — the existing file already had similar.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/migrations.test.ts`
Expected: first two tests fail — migration does not yet touch `autoRecur`.

- [ ] **Step 3: Extend `migrateCards`**

In `src/utils/migrations.ts`, add a second inner transform inside the `benefits.map`:

```ts
import type { Benefit, CreditCard, UsageRecord } from "../models/types";

const monthKey = (iso: string): string => iso.slice(0, 7);

const isMonthlySubscriptionLike = (b: Benefit): boolean =>
  b.resetType === "subscription" ||
  (b.resetType === "calendar" && b.resetConfig.period === "monthly");

const migrateAutoRecur = (benefit: Benefit): Benefit => {
  // If legacy fields are absent, nothing to do.
  if (benefit.autoRecur === undefined && benefit.cancelledMonths === undefined) {
    return benefit;
  }

  const cancelled = new Set(benefit.cancelledMonths ?? []);
  const shouldPropagate = benefit.autoRecur === true && isMonthlySubscriptionLike(benefit);

  const records: UsageRecord[] = shouldPropagate
    ? benefit.usageRecords.map((r) =>
        cancelled.has(monthKey(r.usedDate)) || r.propagateNext !== undefined
          ? r
          : { ...r, propagateNext: true },
      )
    : benefit.usageRecords;

  const { autoRecur: _ar, cancelledMonths: _cm, ...rest } = benefit;
  return { ...rest, usageRecords: records };
};

export const migrateCards = (cards: CreditCard[]): CreditCard[] => {
  return cards.map((card) => ({
    ...card,
    benefits: card.benefits.map((benefit) => {
      let next = benefit;

      // Marriott H2 airline credit availableFromDate (existing migration)
      if (
        next.resetType === "one_time" &&
        next.name === "$50 Airline Credit (H2 2026)" &&
        !next.resetConfig.availableFromDate
      ) {
        next = {
          ...next,
          resetConfig: { ...next.resetConfig, availableFromDate: "2026-07-01" },
        };
      }

      // autoRecur → propagateNext
      next = migrateAutoRecur(next);

      return next;
    }),
  }));
};
```

- [ ] **Step 4: Run migration tests**

Run: `npx vitest run src/utils/migrations.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Run full suite**

Run: `npm run test`
Expected: all tests pass. (Existing tests don't yet exercise the migration; `Benefit` type still has `autoRecur` field so untouched data is fine.)

- [ ] **Step 6: Commit**

```bash
git add src/utils/migrations.ts src/utils/migrations.test.ts
git commit -m "migrate legacy autoRecur+cancelledMonths to per-record propagateNext"
```

---

## Task 3: Store — `recalculate` action and per-record `generateAutoRecurRecords`

**Files:**
- Modify: `src/stores/useCardStore.ts`
- Modify: `src/stores/useCardStore.test.ts`

- [ ] **Step 1: Write failing tests for new behavior**

Replace the existing `describe("generateAutoRecurRecords — smart replication", …)` block in `src/stores/useCardStore.test.ts` with:

```ts
describe("generateAutoRecurRecords — per-record propagation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-15T10:00:00"));
  });
  afterEach(() => { vi.useRealTimers(); });

  const makeMonthlySub = (records: UsageRecord[]): Benefit => ({
    id: "b1",
    name: "$25/mo",
    description: "",
    faceValue: 25,
    category: "streaming",
    resetType: "subscription",
    resetConfig: {},
    isHidden: false,
    autoRecur: false, // legacy field retained; no longer consulted
    rolloverable: false,
    rolloverMaxYears: 0,
    usageRecords: records,
  });

  const seed = (benefit: Benefit) => {
    useCardStore.setState({
      cards: [{
        id: "c1", owner: "me", cardTypeSlug: "amex_platinum",
        annualFee: 695, cardOpenDate: "2024-01-01", color: "#000",
        isEnabled: true, benefits: [benefit],
      }],
    });
  };

  it("creates current-month record when prev month has propagateNext=true", () => {
    seed(makeMonthlySub([
      { usedDate: "2026-03-10", faceValue: 25, actualValue: 22, propagateNext: true },
    ]));
    useCardStore.getState().generateAutoRecurRecords();
    const records = useCardStore.getState().cards[0].benefits[0].usageRecords;
    expect(records).toHaveLength(2);
    expect(records[1]).toMatchObject({
      usedDate: "2026-04-01",
      faceValue: 25,
      actualValue: 22,
      propagateNext: true,
    });
  });

  it("does NOT create when prev month's propagateNext is false/absent", () => {
    seed(makeMonthlySub([
      { usedDate: "2026-03-10", faceValue: 25, actualValue: 22 },
    ]));
    useCardStore.getState().generateAutoRecurRecords();
    expect(useCardStore.getState().cards[0].benefits[0].usageRecords).toHaveLength(1);
  });

  it("does NOT create when current month already has a record", () => {
    seed(makeMonthlySub([
      { usedDate: "2026-03-10", faceValue: 25, actualValue: 22, propagateNext: true },
      { usedDate: "2026-04-02", faceValue: 25, actualValue: 25 },
    ]));
    useCardStore.getState().generateAutoRecurRecords();
    expect(useCardStore.getState().cards[0].benefits[0].usageRecords).toHaveLength(2);
  });

  it("does NOT create when prev month is missing (two-month gap)", () => {
    seed(makeMonthlySub([
      { usedDate: "2026-02-10", faceValue: 25, actualValue: 22, propagateNext: true },
    ]));
    useCardStore.getState().generateAutoRecurRecords();
    expect(useCardStore.getState().cards[0].benefits[0].usageRecords).toHaveLength(1);
  });

  it("is idempotent", () => {
    seed(makeMonthlySub([
      { usedDate: "2026-03-10", faceValue: 25, actualValue: 22, propagateNext: true },
    ]));
    useCardStore.getState().generateAutoRecurRecords();
    useCardStore.getState().generateAutoRecurRecords();
    expect(useCardStore.getState().cards[0].benefits[0].usageRecords).toHaveLength(2);
  });
});

describe("recalculate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-15T10:00:00"));
  });
  afterEach(() => { vi.useRealTimers(); });

  it("bumps store.now and runs generation", () => {
    const before = useCardStore.getState().now;
    vi.advanceTimersByTime(5 * 60 * 1000);
    useCardStore.getState().recalculate();
    const after = useCardStore.getState().now;
    expect(after.getTime()).toBeGreaterThan(before.getTime());
  });
});
```

Delete any older "smart replication" block that conflicts with these tests (the previous plan's monthKey/cancelledMonths-based tests). Keep tests unrelated to autoRecur untouched.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/stores/useCardStore.test.ts`
Expected: failures — `recalculate` is not a function; existing `generateAutoRecurRecords` still uses the old model so several new assertions fail.

- [ ] **Step 3: Rewrite `generateAutoRecurRecords`**

Replace lines 321-350 (the existing implementation) in `src/stores/useCardStore.ts`:

```ts
  generateAutoRecurRecords: () => {
    const today = get().now;
    const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const prevMonthKey = formatMonthKey(
      new Date(today.getFullYear(), today.getMonth() - 1, 1),
    );
    const currentMonthKey = formatMonthKey(today);
    const currentMonthStartIso = formatDate(currentMonthStart);

    set((state) => ({
      cards: state.cards.map((card) => ({
        ...card,
        benefits: card.benefits.map((benefit) => {
          const isMonthlyLike =
            benefit.resetType === "subscription" ||
            (benefit.resetType === "calendar" && benefit.resetConfig.period === "monthly");
          if (!isMonthlyLike) return benefit;

          const hasCurrent = benefit.usageRecords.some(
            (r) => formatMonthKey(new Date(r.usedDate + "T00:00:00")) === currentMonthKey,
          );
          if (hasCurrent) return benefit;

          const prev = benefit.usageRecords.find(
            (r) => formatMonthKey(new Date(r.usedDate + "T00:00:00")) === prevMonthKey,
          );
          if (!prev || prev.propagateNext !== true) return benefit;

          const newRecord: UsageRecord = {
            usedDate: currentMonthStartIso,
            faceValue: benefit.faceValue,
            actualValue: prev.actualValue,
            propagateNext: true,
          };
          return { ...benefit, usageRecords: [...benefit.usageRecords, newRecord] };
        }),
      })),
    }));
  },
```

- [ ] **Step 4: Add `recalculate` action**

In `src/stores/useCardStore.ts`:

1. Add to `CardStoreActions` interface:

```ts
  recalculate: () => void;
```

2. Add to the returned object (immediately after `generateAutoRecurRecords`):

```ts
  recalculate: () => {
    set({ now: new Date() });
    get().generateAutoRecurRecords();
  },
```

- [ ] **Step 5: Remove stale `resolveAutoRecurValue` import if present**

If `src/stores/useCardStore.ts` still imports `resolveAutoRecurValue`, remove that import. The new generation logic reads the prev-month record's `actualValue` directly.

- [ ] **Step 6: Run tests**

Run: `npx vitest run src/stores/useCardStore.test.ts`
Expected: all `generateAutoRecurRecords — per-record propagation` and `recalculate` tests pass.

- [ ] **Step 7: Run full suite**

Run: `npm run test`
Expected: all pass (or only break in files we update in later tasks — if any failures are in e2e-flows or store-integration, note them and fix in Task 4 or 9). Fix any test breakage by swapping the legacy `autoRecur`/`cancelledMonths` setups to use `propagateNext`-on-records.

- [ ] **Step 8: Commit**

```bash
git add src/stores/useCardStore.ts src/stores/useCardStore.test.ts
git commit -m "rewrite generateAutoRecurRecords to use per-record propagateNext + add recalculate"
```

---

## Task 4: Store — thread `propagateNext` through toggle/cycle actions

**Files:**
- Modify: `src/stores/useCardStore.ts`
- Modify: `src/stores/useCardStore.test.ts`

- [ ] **Step 1: Write failing test**

Append to `src/stores/useCardStore.test.ts`:

```ts
describe("setBenefitCycleUsed with propagateNext", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-15T10:00:00"));
    useCardStore.setState({
      cards: [{
        id: "c1", owner: "me", cardTypeSlug: "amex_platinum",
        annualFee: 695, cardOpenDate: "2024-01-01", color: "#000",
        isEnabled: true,
        benefits: [{
          id: "b1", name: "$25/mo", description: "", faceValue: 25,
          category: "streaming", resetType: "subscription", resetConfig: {},
          isHidden: false, autoRecur: false, rolloverable: false,
          rolloverMaxYears: 0, usageRecords: [],
        }],
      }],
    });
  });
  afterEach(() => { vi.useRealTimers(); });

  it("writes propagateNext onto the new record", () => {
    useCardStore.getState().setBenefitCycleUsed(
      "c1", "b1", "2026-04-01", "2026-04-30", true,
      { actualValue: 22, usedDate: "2026-04-10", propagateNext: true },
    );
    const rec = useCardStore.getState().cards[0].benefits[0].usageRecords[0];
    expect(rec.propagateNext).toBe(true);
    expect(rec.actualValue).toBe(22);
  });

  it("updates propagateNext on an existing record in the cycle", () => {
    useCardStore.setState((s) => ({
      cards: s.cards.map((c) => ({
        ...c,
        benefits: c.benefits.map((b) => ({
          ...b,
          usageRecords: [{ usedDate: "2026-04-05", faceValue: 25, actualValue: 25, propagateNext: true }],
        })),
      })),
    }));
    useCardStore.getState().setBenefitCycleUsed(
      "c1", "b1", "2026-04-01", "2026-04-30", true,
      { actualValue: 20, propagateNext: false },
    );
    const records = useCardStore.getState().cards[0].benefits[0].usageRecords;
    expect(records).toHaveLength(1);
    expect(records[0].actualValue).toBe(20);
    expect(records[0].propagateNext).toBe(false);
  });

  it("removes the record when used=false (no cancelledMonths bookkeeping)", () => {
    useCardStore.setState((s) => ({
      cards: s.cards.map((c) => ({
        ...c,
        benefits: c.benefits.map((b) => ({
          ...b,
          usageRecords: [{ usedDate: "2026-04-05", faceValue: 25, actualValue: 25, propagateNext: true }],
        })),
      })),
    }));
    useCardStore.getState().setBenefitCycleUsed(
      "c1", "b1", "2026-04-01", "2026-04-30", false,
    );
    expect(useCardStore.getState().cards[0].benefits[0].usageRecords).toHaveLength(0);
    expect(useCardStore.getState().cards[0].benefits[0].cancelledMonths).toBeUndefined();
  });
});
```

Also update the existing `setBenefitCycleUsed` tests that previously asserted `cancelledMonths` behavior to reflect the new model — any test named like "adds current month to cancelledMonths" should be removed; if its intent was "uncheck removes the record", assert that.

- [ ] **Step 2: Update `SetBenefitCycleUsed` action type signature**

In `CardStoreActions` interface (line ~21-28), modify the `opts` parameter:

```ts
  setBenefitCycleUsed: (
    cardId: string,
    benefitId: string,
    cycleStart: string,
    cycleEnd: string,
    used: boolean,
    opts?: { actualValue?: number; usedDate?: string; propagateNext?: boolean },
  ) => void;
```

- [ ] **Step 3: Rewrite `setBenefitCycleUsed` body**

Replace lines 157-231 in `src/stores/useCardStore.ts`:

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

      if (used) {
        if (existingInCycle) {
          // Update in place: let caller change actualValue / propagateNext / usedDate.
          const updated: UsageRecord = {
            ...existingInCycle,
            actualValue: opts?.actualValue ?? existingInCycle.actualValue,
            usedDate: opts?.usedDate ?? existingInCycle.usedDate,
            propagateNext:
              opts?.propagateNext !== undefined
                ? opts.propagateNext
                : existingInCycle.propagateNext,
          };
          return {
            cards: updateBenefitInCards(state.cards, cardId, benefitId, (b) => ({
              ...b,
              usageRecords: b.usageRecords.map((r) =>
                r === existingInCycle ? updated : r,
              ),
            })),
          };
        }
        const todayIso = formatDate(new Date());
        const defaultDate =
          todayIso >= cycleStart && todayIso <= cycleEnd ? todayIso : cycleStart;
        const newRecord: UsageRecord = {
          usedDate: opts?.usedDate ?? defaultDate,
          faceValue: benefit.faceValue,
          actualValue: opts?.actualValue ?? benefit.faceValue,
          ...(opts?.propagateNext !== undefined ? { propagateNext: opts.propagateNext } : {}),
        };
        return {
          cards: updateBenefitInCards(state.cards, cardId, benefitId, (b) => ({
            ...b,
            usageRecords: [...b.usageRecords, newRecord],
          })),
        };
      }

      // used === false: remove the record in cycle (chain naturally breaks)
      if (!existingInCycle) return state;
      return {
        cards: updateBenefitInCards(state.cards, cardId, benefitId, (b) => ({
          ...b,
          usageRecords: b.usageRecords.filter((r) => r !== existingInCycle),
        })),
      };
    });
  },
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/stores/useCardStore.test.ts`
Expected: all pass.

- [ ] **Step 5: Remove stale `formatMonthKey` import if unused**

If `formatMonthKey` is still imported in useCardStore.ts but no longer referenced in any action body other than `generateAutoRecurRecords`, keep the import. Otherwise remove.

- [ ] **Step 6: Run full suite**

Run: `npm run test`
Expected: failures likely in `tests/store-integration.test.ts` or `tests/e2e-flows.test.tsx` that still assert on `cancelledMonths`. Update those tests to the new model (delete = no record; propagateNext instead of cancelledMonths).

- [ ] **Step 7: Commit**

```bash
git add src/stores/useCardStore.ts src/stores/useCardStore.test.ts tests/store-integration.test.ts tests/e2e-flows.test.tsx
git commit -m "thread propagateNext through setBenefitCycleUsed; drop cancelledMonths bookkeeping"
```

---

## Task 5: Clean up `autoRecur` consumers (period, reminder, benefitDisplay, store count)

**Files:**
- Modify: `src/utils/period.ts` (drop `autoRecur` from `DeadlineInput`)
- Modify: `src/utils/reminder.ts`
- Modify: `src/utils/benefitDisplay.ts`
- Modify: `src/stores/useCardStore.ts` (`getUnusedBenefitCount`)
- Modify: `src/views/shared/BenefitCard.tsx` (label logic + `getDeadline` call)
- Modify: relevant test files

- [ ] **Step 1: Write failing test for new label logic**

In `src/views/shared/BenefitCard.test.tsx`, add (or update existing):

```ts
it("shows '订阅·自动' when a usage record has propagateNext=true", () => {
  const benefit: Benefit = {
    id: "b1", name: "$25/mo", description: "", faceValue: 25,
    category: "streaming", resetType: "subscription", resetConfig: {},
    isHidden: false, autoRecur: false, rolloverable: false, rolloverMaxYears: 0,
    usageRecords: [
      { usedDate: "2026-04-01", faceValue: 25, actualValue: 25, propagateNext: true },
    ],
  };
  renderBenefitCard({ benefit });
  expect(screen.getByText("订阅·自动")).toBeInTheDocument();
});

it("shows '订阅' when the latest record lacks propagateNext", () => {
  const benefit: Benefit = {
    id: "b1", name: "$25/mo", description: "", faceValue: 25,
    category: "streaming", resetType: "subscription", resetConfig: {},
    isHidden: false, autoRecur: true, // legacy still set; should NOT drive label
    rolloverable: false, rolloverMaxYears: 0,
    usageRecords: [{ usedDate: "2026-04-01", faceValue: 25, actualValue: 25 }],
  };
  renderBenefitCard({ benefit });
  expect(screen.getByText("订阅")).toBeInTheDocument();
});
```

(Adjust `renderBenefitCard` to whatever helper the existing tests use.)

- [ ] **Step 2: Run tests to verify failures**

Run: `npx vitest run src/views/shared/BenefitCard.test.tsx`
Expected: the second test fails because the current `getResetLabel` still uses `benefit.autoRecur`.

- [ ] **Step 3: Update `getResetLabel` in `BenefitCard.tsx`**

Replace the subscription branch in `getResetLabel`:

```ts
const latestHasPropagate = (b: Benefit): boolean => {
  if (b.usageRecords.length === 0) return false;
  const sorted = [...b.usageRecords].sort((a, b) => b.usedDate.localeCompare(a.usedDate));
  return sorted[0].propagateNext === true;
};

const getResetLabel = (benefit: Benefit): string => {
  if (benefit.resetType === "subscription") return latestHasPropagate(benefit) ? "订阅·自动" : "订阅";
  // …rest unchanged
};
```

Also update the tooltip hook (line 138-142): change the condition to `latestHasPropagate(benefit)`.

Also update the `getDeadline` call site in the same file (remove the `autoRecur` param):

```ts
  const deadline = getDeadline(today, {
    resetType: benefit.resetType,
    resetConfig: benefit.resetConfig,
    cardOpenDate: card.cardOpenDate,
    statementClosingDay: card.statementClosingDay,
  });
```

- [ ] **Step 4: Remove `autoRecur` from `DeadlineInput`**

In `src/utils/period.ts`, modify `DeadlineInput`:

```ts
export interface DeadlineInput {
  resetType: ResetType;
  resetConfig: ResetConfig;
  cardOpenDate?: string;
  statementClosingDay?: number;
}
```

`getDeadline` no longer references `autoRecur` — leave the body untouched otherwise.

- [ ] **Step 5: Clean up `src/utils/reminder.ts`**

Remove any remaining `autoRecur` references. The calls to `getDeadline` should no longer pass `autoRecur`. Skim the file and adjust.

- [ ] **Step 6: Clean up `src/utils/benefitDisplay.ts`**

Replace every `b.resetType === "subscription" && b.autoRecur` branch with the `latestHasPropagate` predicate:

```ts
const latestHasPropagate = (b: Benefit): boolean => {
  if (b.usageRecords.length === 0) return false;
  const sorted = [...b.usageRecords].sort((a, b2) => b2.usedDate.localeCompare(a.usedDate));
  return sorted[0].propagateNext === true;
};

// then within expandUsed / expandAll, replace
//   const autoRecur = b.resetType === "subscription" && b.autoRecur;
// with
//   const autoRecur = b.resetType === "subscription" && latestHasPropagate(b);
```

The `autoRecurUsedOverride` semantics stay the same — a subscription with an active propagation counts all cycles as "used".

Also in `expandUnused`, the line

```ts
if (b.resetType === "subscription" && b.autoRecur) continue;
```

becomes

```ts
if (b.resetType === "subscription" && latestHasPropagate(b)) continue;
```

- [ ] **Step 7: Clean up `getUnusedBenefitCount`**

In `src/stores/useCardStore.ts` at the `getUnusedBenefitCount` function (lines ~265-279), remove any lingering `autoRecur` check. If a subscription has a propagating latest record, it still counts as unused only if no record exists for the current month — the existing `isBenefitUsedInPeriod` handles that correctly.

- [ ] **Step 8: Update existing unit tests that asserted autoRecur-driven behavior**

Files to check: `src/utils/reminder.test.ts`, `src/utils/benefitDisplay.test.ts`. Where a test set `autoRecur: true` to drive an expectation, rewrite to include a usage record with `propagateNext: true` instead. Leave assertion semantics identical.

- [ ] **Step 9: Run full suite**

Run: `npm run test`
Expected: all tests pass after the test updates.

- [ ] **Step 10: Commit**

```bash
git add src/utils/period.ts src/utils/reminder.ts src/utils/benefitDisplay.ts src/stores/useCardStore.ts src/views/shared/BenefitCard.tsx src/views/shared/BenefitCard.test.tsx src/utils/reminder.test.ts src/utils/benefitDisplay.test.ts
git commit -m "drive auto-recur label/semantics from latest record's propagateNext"
```

---

## Task 6: `BenefitEditor` — remove `autoRecur` UI

**Files:**
- Modify: `src/views/main/BenefitEditor.tsx`
- Modify: `src/views/main/BenefitEditor.test.tsx`

- [ ] **Step 1: Write failing test**

In `src/views/main/BenefitEditor.test.tsx`, add or replace a test:

```ts
it("does not render the autoRecur field for subscription benefits", () => {
  render(<BenefitEditor cardId="c1" onSave={() => {}} onCancel={() => {}} />);
  fireEvent.change(screen.getByTestId("reset-type-select"), { target: { value: "subscription" } });
  expect(screen.queryByTestId("auto-recur-field")).not.toBeInTheDocument();
});
```

Delete or update any existing test that asserts the autoRecur field renders.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/views/main/BenefitEditor.test.tsx`
Expected: fails because the field currently renders.

- [ ] **Step 3: Remove autoRecur from BenefitEditor**

In `src/views/main/BenefitEditor.tsx`:

1. Delete the block at lines 285-295 (the `{form.resetType === "subscription" && …}` `label`).
2. Delete the `autoRecur: boolean` field from the form state interface (line 25).
3. Delete `autoRecur: benefit?.autoRecur ?? false` from the initial state (line 67).
4. Delete the `autoRecur: form.resetType === "subscription" ? form.autoRecur : false` line from the submit handler (line 119). When constructing the saved `Benefit`, set `autoRecur: false` as a constant (compatibility stub until Task 10 removes it from the type).
5. Remove the `handleChange("autoRecur", …)` callback usage.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/views/main/BenefitEditor.test.tsx`
Expected: pass.

- [ ] **Step 5: Run full suite**

Run: `npm run test`
Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add src/views/main/BenefitEditor.tsx src/views/main/BenefitEditor.test.tsx
git commit -m "remove autoRecur checkbox from BenefitEditor"
```

---

## Task 7: `BenefitCard` usage prompt — add `自动续期下月` checkbox and edit-mode

**Files:**
- Modify: `src/views/shared/BenefitCard.tsx`
- Modify: `src/views/shared/BenefitCard.test.tsx`
- Modify: `src/views/shared/BenefitCard.css` (maybe)

- [ ] **Step 1: Write failing test — new record with propagate**

In `src/views/shared/BenefitCard.test.tsx`:

```ts
it("passes propagateNext=true when the checkbox is checked on confirm", () => {
  const onSetCycleUsed = vi.fn();
  const benefit: Benefit = {
    id: "b1", name: "$25/mo", description: "", faceValue: 25,
    category: "streaming", resetType: "subscription", resetConfig: {},
    isHidden: false, autoRecur: false, rolloverable: false, rolloverMaxYears: 0,
    usageRecords: [],
  };
  render(
    <BenefitCard
      benefit={benefit}
      card={makeCard()}
      onToggleUsage={() => {}}
      onSetCycleUsed={onSetCycleUsed}
      cycleStart="2026-04-01"
      cycleEnd="2026-04-30"
      cycleUsed={false}
    />,
  );
  fireEvent.click(screen.getByLabelText(/标记使用/));
  fireEvent.click(screen.getByLabelText("自动续期下月"));
  fireEvent.click(screen.getByLabelText("确认"));
  expect(onSetCycleUsed).toHaveBeenCalledWith(
    "c1", "b1", "2026-04-01", "2026-04-30", true,
    expect.objectContaining({ propagateNext: true }),
  );
});

it("opens edit prompt (not uncheck) when clicking a used monthly record", () => {
  const onSetCycleUsed = vi.fn();
  const benefit: Benefit = {
    id: "b1", name: "$25/mo", description: "", faceValue: 25,
    category: "streaming", resetType: "subscription", resetConfig: {},
    isHidden: false, autoRecur: false, rolloverable: false, rolloverMaxYears: 0,
    usageRecords: [],
  };
  const usedRecord: UsageRecord = {
    usedDate: "2026-04-10", faceValue: 25, actualValue: 22, propagateNext: true,
  };
  render(
    <BenefitCard
      benefit={benefit}
      card={makeCard()}
      onToggleUsage={() => {}}
      onSetCycleUsed={onSetCycleUsed}
      cycleStart="2026-04-01"
      cycleEnd="2026-04-30"
      cycleUsed={true}
      cycleRecord={usedRecord}
    />,
  );
  fireEvent.click(screen.getByLabelText("取消使用"));
  // edit prompt appears with existing value prefilled
  expect(screen.getByLabelText("实际到手")).toHaveValue(22);
  expect(screen.getByLabelText("自动续期下月")).toBeChecked();
  expect(onSetCycleUsed).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/views/shared/BenefitCard.test.tsx`
Expected: failures — no `自动续期下月` checkbox; click on used simply unsets.

- [ ] **Step 3: Update `BenefitCard.tsx`**

Near the top of the component, add helpers + state:

```ts
const isMonthlyLikeBenefit = (b: Benefit): boolean =>
  b.resetType === "subscription" ||
  (b.resetType === "calendar" && b.resetConfig.period === "monthly");

const defaultPropagateForBenefit = (b: Benefit): boolean => {
  if (b.usageRecords.length === 0) return false;
  const sorted = [...b.usageRecords].sort((a, b2) => b2.usedDate.localeCompare(a.usedDate));
  return sorted[0].propagateNext === true;
};
```

Extend component state:

```ts
const [pendingPropagate, setPendingPropagate] = useState<boolean>(false);
const [editMode, setEditMode] = useState<"add" | "edit">("add");
```

Rewrite `handleClick`:

```ts
const handleClick = () => {
  if (isUsed) {
    // For monthly-like benefits, open edit prompt instead of plain uncheck
    if (isMonthlyLikeBenefit(benefit) && cycleContext && onSetCycleUsed && cycleRecord) {
      setPendingValue(String(cycleRecord.actualValue));
      setPendingDate(cycleRecord.usedDate);
      setPendingPropagate(cycleRecord.propagateNext === true);
      setEditMode("edit");
      return;
    }
    // Non-monthly: legacy uncheck behavior
    if (cycleContext && onSetCycleUsed) {
      onSetCycleUsed(card.id, benefit.id, cycleContext.start, cycleContext.end, false);
      return;
    }
    onToggleUsage(card.id, benefit.id);
    return;
  }
  setPendingValue(String(benefit.faceValue));
  setPendingDate(defaultPendingDate);
  setPendingPropagate(defaultPropagateForBenefit(benefit));
  setEditMode("add");
};
```

Rewrite `handleConfirm` to pass `propagateNext`:

```ts
const handleConfirm = () => {
  if (pendingValue === null) return;
  const value = Number(pendingValue);
  if (isNaN(value) || value < 0) return;
  if (dateRequired && !pendingDate) return;
  const propagateOpt = isMonthlyLikeBenefit(benefit) ? { propagateNext: pendingPropagate } : {};
  if (cycleContext && onSetCycleUsed) {
    onSetCycleUsed(card.id, benefit.id, cycleContext.start, cycleContext.end, true, {
      actualValue: value,
      usedDate: pendingDate || undefined,
      ...propagateOpt,
    });
  } else {
    onToggleUsage(card.id, benefit.id, value, pendingDate || undefined);
  }
  setPendingValue(null);
};
```

Add a "Delete" button inside the prompt for `editMode === "edit"`:

```tsx
{editMode === "edit" && cycleContext && onSetCycleUsed && (
  <button
    className="benefit-card__action-btn benefit-card__action-btn--danger"
    onClick={() => {
      onSetCycleUsed(card.id, benefit.id, cycleContext.start, cycleContext.end, false);
      setPendingValue(null);
    }}
    aria-label="删除记录"
    title="删除记录"
  >
    ✕
  </button>
)}
```

Add the checkbox inside `.benefit-card__prompt-fields`, conditional on `isMonthlyLikeBenefit(benefit)`:

```tsx
{isMonthlyLikeBenefit(benefit) && (
  <label className="benefit-card__prompt-label benefit-card__prompt-label--checkbox">
    <input
      type="checkbox"
      checked={pendingPropagate}
      onChange={(e) => { setPendingPropagate(e.target.checked); }}
      aria-label="自动续期下月"
    />
    自动续期下月
  </label>
)}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/views/shared/BenefitCard.test.tsx`
Expected: pass.

- [ ] **Step 5: Run full suite**

Run: `npm run test`
Expected: pass. Update any integration test that clicked on a used subscription benefit expecting a direct uncheck — those now need to click through the edit prompt's delete button.

- [ ] **Step 6: Commit**

```bash
git add src/views/shared/BenefitCard.tsx src/views/shared/BenefitCard.test.tsx src/views/shared/BenefitCard.css tests/
git commit -m "surface propagateNext checkbox in usage prompt + edit mode for used monthly records"
```

---

## Task 8: `useToday` hook + wire today-sensitive components to store.now

**Files:**
- Create: `src/stores/useToday.ts`
- Modify: `src/views/shared/BenefitCard.tsx`, `src/views/main/Dashboard.tsx`, `src/views/tray/ByUrgencyView.tsx`, `src/views/tray/ByCardView.tsx`, reminder-banner call sites

- [ ] **Step 1: Create `useToday` hook**

Create `src/stores/useToday.ts`:

```ts
import { useCardStore } from "./useCardStore";

/** Subscribes to the store's monotonic `now` so consumers re-render whenever
 * recalculate() is called (startup, focus, midnight). */
export const useToday = (): Date => useCardStore((s) => s.now);
```

- [ ] **Step 2: Write failing test**

Create `src/stores/useToday.test.ts`:

```ts
import { renderHook, act } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useToday } from "./useToday";
import { useCardStore } from "./useCardStore";

describe("useToday", () => {
  it("re-renders when recalculate() bumps now", () => {
    const { result } = renderHook(() => useToday());
    const before = result.current;
    act(() => { useCardStore.getState().recalculate(); });
    const after = result.current;
    expect(after.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(after).not.toBe(before);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/stores/useToday.test.ts`
Expected: pass.

- [ ] **Step 4: Wire in `BenefitCard.tsx`**

Replace `const today = new Date();` at line 65 with:

```ts
const today = useToday();
```

Add `import { useToday } from "../../stores/useToday";` at top.

- [ ] **Step 5: Wire in Dashboard, tray views, reminder banner**

Search for `new Date()` in `src/views/main/Dashboard.tsx`, `src/views/tray/ByUrgencyView.tsx`, `src/views/tray/ByCardView.tsx`, and any reminder-related component. For each occurrence used to drive benefit visibility or deadlines, replace with `useToday()`. Leave purely formatting-local dates alone.

- [ ] **Step 6: Run full suite**

Run: `npm run test`
Expected: pass. Components now read from the store but the initial `now` is set at store creation, so values are equivalent to the previous `new Date()` behavior.

- [ ] **Step 7: Commit**

```bash
git add src/stores/useToday.ts src/stores/useToday.test.ts src/views/
git commit -m "add useToday hook and wire today-sensitive components to store.now"
```

---

## Task 9: Triggers — window focus + daily midnight timer

**Files:**
- Modify: `src/views/main/MainWindow.tsx`
- Modify: `src/tauri/persistence.ts`
- Test: `src/views/main/MainWindow.test.tsx` (create if absent)

- [ ] **Step 1: Update persistence to call `recalculate`**

In `src/tauri/persistence.ts` line 122, replace:

```ts
useCardStore.getState().generateAutoRecurRecords();
```

with:

```ts
useCardStore.getState().recalculate();
```

Also update the comment on line 111-112 to say "`recalculate` (generation + now bump)".

- [ ] **Step 2: Write failing test for focus trigger**

Create `src/views/main/MainWindow.test.tsx` (or add to existing):

```ts
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MainWindow } from "./MainWindow";
import { useCardStore } from "../../stores/useCardStore";

describe("MainWindow today-refresh wiring", () => {
  it("calls recalculate() on window focus", () => {
    const spy = vi.spyOn(useCardStore.getState(), "recalculate");
    render(<MainWindow />);
    window.dispatchEvent(new FocusEvent("focus"));
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("schedules a midnight timer on mount", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-15T23:59:00"));
    const spy = vi.spyOn(useCardStore.getState(), "recalculate");
    render(<MainWindow />);
    vi.advanceTimersByTime(2 * 60 * 1000);
    expect(spy).toHaveBeenCalled();
    vi.useRealTimers();
    spy.mockRestore();
  });
});
```

- [ ] **Step 3: Run test to verify failure**

Run: `npx vitest run src/views/main/MainWindow.test.tsx`
Expected: fail — no listener or timer yet.

- [ ] **Step 4: Add effect to `MainWindow.tsx`**

At the top of the component, add:

```tsx
import { useEffect } from "react";
import { useCardStore } from "../../stores/useCardStore";

// …inside component body
useEffect(() => {
  const onFocus = () => { useCardStore.getState().recalculate(); };
  window.addEventListener("focus", onFocus);

  // Schedule a timer for local midnight; reschedule on each fire.
  let timer: number | null = null;
  const schedule = () => {
    const now = new Date();
    const nextMidnight = new Date(
      now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5,
    );
    const ms = Math.max(60_000, nextMidnight.getTime() - now.getTime());
    timer = window.setTimeout(() => {
      useCardStore.getState().recalculate();
      schedule();
    }, ms);
  };
  schedule();

  return () => {
    window.removeEventListener("focus", onFocus);
    if (timer !== null) window.clearTimeout(timer);
  };
}, []);
```

(If `MainWindow` is a class or already has effects, integrate as appropriate.)

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/views/main/MainWindow.test.tsx`
Expected: pass.

- [ ] **Step 6: Run full suite**

Run: `npm run test`
Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add src/views/main/MainWindow.tsx src/views/main/MainWindow.test.tsx src/tauri/persistence.ts
git commit -m "add window-focus and daily-midnight triggers for recalculate"
```

---

## Task 10: Strip `autoRecur` and `cancelledMonths` from types and remaining references

**Files:**
- Modify: `src/models/types.ts`
- Modify: `src/stores/useCardStore.ts` (remove `toggleBenefitAutoRecur`, stale `autoRecur` writes in new-benefit factories, imports)
- Modify: any test fixture still setting `autoRecur`/`cancelledMonths` — keep fixtures building valid `Benefit` objects without these fields
- Modify: `src/models/templates.ts` or any template-from-JSON loader if it currently writes `autoRecur: false` to the constructed Benefit — replace with nothing (optional field, default undefined)

- [ ] **Step 1: Remove `autoRecur` and `cancelledMonths` from `Benefit`**

In `src/models/types.ts`:

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
  rolloverable: boolean;
  rolloverMaxYears: number;
  usageRecords: UsageRecord[];
}
```

(Note: `autoRecur` and `cancelledMonths` are gone.)

- [ ] **Step 2: Delete `toggleBenefitAutoRecur`**

In `src/stores/useCardStore.ts`:
1. Remove the `toggleBenefitAutoRecur` line from `CardStoreActions` interface.
2. Remove the `toggleBenefitAutoRecur: (cardId, benefitId) => { … }` block.

- [ ] **Step 3: Fix fixture factories and benefit constructors**

Compile errors now flag every file that still references `autoRecur` or `cancelledMonths`. Resolve each:

- Test helpers that build a `Benefit` literal: delete the `autoRecur: false` line.
- `migrations.ts` `migrateAutoRecur`: still reads `benefit.autoRecur` via structural check — since the incoming `Benefit` type no longer declares the field, cast the argument shape: `(benefit as Benefit & { autoRecur?: boolean; cancelledMonths?: string[] })`. This is the one place it's legitimate, since the function reads *legacy* data.
- Templates / card-type loaders that produce a `Benefit` from JSON: remove any explicit `autoRecur: false` from the constructed object.

- [ ] **Step 4: Run lint**

Run: `npm run lint`
Expected: only the pre-existing Dashboard.test.tsx non-null-assertion error. Everything else clean.

- [ ] **Step 5: Run full suite**

Run: `npm run test`
Expected: pass.

- [ ] **Step 6: Update documentation**

In `docs/dev/modules/store.md`, update the `generateAutoRecurRecords()` row to describe per-record behavior. If there is a `subscription.md` or similar module doc, align it. Keep to a few lines each.

- [ ] **Step 7: Commit**

```bash
git add src/models/types.ts src/stores/useCardStore.ts src/utils/migrations.ts src/models/templates.ts docs/dev/modules/store.md tests/
git commit -m "remove Benefit.autoRecur and Benefit.cancelledMonths; migration is sole reader of legacy fields"
```

---

## Self-Review Checklist (run before handing off)

**Spec coverage:**
- [x] `UsageRecord.propagateNext` — Task 1
- [x] Store `now` field — Task 1
- [x] Generation rule — Task 3
- [x] Idempotent + chain-breaks properties — Task 3 tests
- [x] `recalculate()` action — Task 3
- [x] Startup trigger — Task 9 (persistence.ts swap)
- [x] Focus trigger — Task 9
- [x] Midnight timer — Task 9
- [x] Usage prompt checkbox — Task 7
- [x] Edit-existing-record prompt — Task 7
- [x] Label driven by latest record — Task 5
- [x] Remove `autoRecur` from BenefitEditor — Task 6
- [x] Migration of legacy data — Task 2
- [x] Remove `autoRecur` and `cancelledMonths` — Task 10

**Placeholder scan:** none. Every code block is complete.

**Type consistency:** `opts.propagateNext?: boolean` is the single option name used in both Task 4 (store) and Task 7 (caller). `latestHasPropagate` helper defined in Task 5, reused in Task 7. `useToday` hook name consistent between Task 8 creation and Task 8 wiring.
