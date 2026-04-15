# Statement-Close Aligned Anniversary Benefits — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let anniversary benefits opt into resetting at the next statement close on-or-after the anniversary date, matching how Chase (CSP hotel credit) actually issues credits.

**Architecture:** One optional number field on `CreditCard` (`statementClosingDay`), one optional boolean on `ResetConfig` (`resetsAtStatementClose`), one new helper in `period.ts`, and a routing tweak in `getCurrentPeriodRange`. Both opt-ins silently fall back to pure-anniversary semantics when the other side isn't set.

**Tech Stack:** React + TypeScript + Zustand + Vitest + React Testing Library.

---

## Core Algorithm

Given a `Date today`, `cardOpenDate: string`, `statementClosingDay: number (1–31)`:

1. Compute pure anniversary range `{anniversaryStart, anniversaryEnd}` using the existing `getAnniversaryRange`.
2. Compute `shiftedStart` = first statement close date on-or-after `anniversaryStart`. "Statement close date" for a calendar month `(year, month)` is `min(statementClosingDay, lastDay(year, month))` (so day-31 clamps to day-28 in Feb). The search starts at `anniversaryStart`'s month; if that month's close is before `anniversaryStart`, move to next month.
3. Compute `shiftedEndExclusive` = first statement close date on-or-after `anniversaryEnd + 1 day` (i.e., the next year's shifted start). Subtract 1 day → `shiftedEnd`.
4. Return `{ start: formatDate(shiftedStart), end: formatDate(shiftedEnd) }`.

Tie-break rule: "on-or-after" — if `anniversaryStart` IS itself a statement-close date, `shiftedStart` = that same date.

---

## File Structure

**Modify:**
- `src/models/types.ts` — add `statementClosingDay?: number` to `CreditCard`; add `resetsAtStatementClose?: boolean` to `ResetConfig`.
- `src/utils/period.ts` — add `getAnniversaryStatementClosingRange` helper; extend `getCurrentPeriodRange` to route to it when applicable; extend `PeriodInput` to carry `statementClosingDay` and `resetsAtStatementClose`; update all callers.
- `src/utils/period.test.ts` — new describe block with 6+ cases.
- `src/utils/reminder.ts` and `src/stores/useCardStore.ts` — update callers of `getCurrentPeriodRange` / `isBenefitUsedInPeriod` / `getDeadline` to pass the new fields from `card.statementClosingDay` and `benefit.resetConfig.resetsAtStatementClose`.
- `src/views/main/CardEditor.tsx` — add a "账单结算日 (1-31)" number input. Optional.
- `src/views/main/CardEditor.test.tsx` — test for the new input.
- `src/views/main/BenefitEditor.tsx` — add a checkbox "按账单结算日对齐周期" visible only when `resetType === "anniversary"`. Disabled (with tooltip) when the parent card has no `statementClosingDay`.
- `src/views/main/BenefitEditor.test.tsx` — test for the new checkbox.
- Any CSP template JSON or template loader — add `resetsAtStatementClose: true` to the hotel credit template.

---

## Task 1: Types + helper + unit tests

**Files:**
- Modify: `src/models/types.ts`
- Modify: `src/utils/period.ts`
- Test: `src/utils/period.test.ts`

- [ ] **Step 1: Extend types**

In `src/models/types.ts`, add to `ResetConfig`:

```ts
export interface ResetConfig {
  period?: CalendarPeriod;
  applicableMonths?: number[];
  cooldownDays?: number;
  expiresDate?: string;
  /** When resetType === "anniversary", align the cycle to the next statement
   * close on-or-after the anniversary date. Requires CreditCard.statementClosingDay. */
  resetsAtStatementClose?: boolean;
}
```

Add to `CreditCard`:

```ts
export interface CreditCard {
  // ...existing fields...
  /** Day of month (1-31) that the card's statement closes. Used by
   * resetsAtStatementClose benefits. Clamped to last day of short months. */
  statementClosingDay?: number;
}
```

- [ ] **Step 2: Write failing tests**

Append to `src/utils/period.test.ts`:

```ts
describe("getAnniversaryStatementClosingRange", () => {
  it("shifts both boundaries to the next statement close on or after anniversary", () => {
    // Anniversary = 2025-04-03, close day = 7. Today inside year 2026.
    const today = new Date(2026, 5, 1);
    const range = getAnniversaryStatementClosingRange(today, "2025-04-03", 7);
    expect(range.start).toBe("2026-04-07");
    expect(range.end).toBe("2027-04-06");
  });

  it("treats anniversary date that equals the closing day as the start (no shift)", () => {
    const today = new Date(2026, 5, 1);
    const range = getAnniversaryStatementClosingRange(today, "2025-04-07", 7);
    expect(range.start).toBe("2026-04-07");
    expect(range.end).toBe("2027-04-06");
  });

  it("clamps closing day 31 to last day of short months (Feb)", () => {
    const today = new Date(2026, 2, 1); // March 2026
    const range = getAnniversaryStatementClosingRange(today, "2025-02-10", 31);
    // Anniversary 2026-02-10. Feb 2026 close = Feb 28 (clamped). Start = 2026-02-28.
    // Feb 2027 close = Feb 28. End = 2027-02-27.
    expect(range.start).toBe("2026-02-28");
    expect(range.end).toBe("2027-02-27");
  });

  it("moves to next month when anniversary lands after that month's close", () => {
    // Anniversary = 2025-04-10, close day = 7. April 7 is BEFORE April 10, so start is May 7.
    const today = new Date(2026, 5, 1);
    const range = getAnniversaryStatementClosingRange(today, "2025-04-10", 7);
    expect(range.start).toBe("2026-05-07");
    expect(range.end).toBe("2027-05-06");
  });

  it("handles leap year anniversary + day 31 close", () => {
    // Anniversary Feb 29, leap year 2024. Today inside year 2026. Close day 31.
    // 2026-02 close clamps to 2026-02-28. Anniversary Feb 29 clamped to Feb 28, 2026.
    // Shifted start = 2026-02-28. End = 2027-02-27.
    const today = new Date(2026, 5, 1);
    const range = getAnniversaryStatementClosingRange(today, "2024-02-29", 31);
    expect(range.start).toBe("2026-02-28");
    expect(range.end).toBe("2027-02-27");
  });
});

describe("getCurrentPeriodRange — statement-close routing", () => {
  const today = new Date(2026, 5, 1); // June 1, 2026

  it("uses statement-close helper when resetType=anniversary AND resetsAtStatementClose AND statementClosingDay set", () => {
    const range = getCurrentPeriodRange(today, {
      resetType: "anniversary",
      resetConfig: { resetsAtStatementClose: true },
      cardOpenDate: "2025-04-03",
      statementClosingDay: 7,
    });
    expect(range?.start).toBe("2026-04-07");
    expect(range?.end).toBe("2027-04-06");
  });

  it("falls back to pure anniversary when statementClosingDay is missing", () => {
    const range = getCurrentPeriodRange(today, {
      resetType: "anniversary",
      resetConfig: { resetsAtStatementClose: true },
      cardOpenDate: "2025-04-03",
    });
    expect(range?.start).toBe("2026-04-03");
    expect(range?.end).toBe("2027-04-02");
  });

  it("falls back to pure anniversary when resetsAtStatementClose is false", () => {
    const range = getCurrentPeriodRange(today, {
      resetType: "anniversary",
      resetConfig: {},
      cardOpenDate: "2025-04-03",
      statementClosingDay: 7,
    });
    expect(range?.start).toBe("2026-04-03");
    expect(range?.end).toBe("2027-04-02");
  });
});
```

- [ ] **Step 3: Run tests — verify they fail**

Run: `npm run test -- src/utils/period.test.ts`
Expected: failures citing `getAnniversaryStatementClosingRange` not exported and `statementClosingDay` missing from `PeriodInput`.

- [ ] **Step 4: Implement the helper and wire into `getCurrentPeriodRange`**

In `src/utils/period.ts`:

Add helper after `getAnniversaryRange`:

```ts
/**
 * Shifts an anniversary-aligned window to align with statement close boundaries.
 * The "statement close" for a given (year, month) is min(day, lastDay(year, month)).
 * Both boundaries shift: start = first close on-or-after anniversaryStart;
 * end = (first close on-or-after nextAnniversaryStart) - 1 day.
 */
export const getAnniversaryStatementClosingRange = (
  today: Date,
  cardOpenDate: string,
  statementClosingDay: number,
): DateRange => {
  const anniversary = getAnniversaryRange(today, cardOpenDate);
  const startAnchor = new Date(anniversary.start + "T00:00:00");
  const endAnchorExclusive = new Date(anniversary.end + "T00:00:00");
  endAnchorExclusive.setDate(endAnchorExclusive.getDate() + 1);

  const shiftedStart = firstCloseOnOrAfter(startAnchor, statementClosingDay);
  const shiftedEndExclusive = firstCloseOnOrAfter(endAnchorExclusive, statementClosingDay);
  const shiftedEnd = new Date(shiftedEndExclusive);
  shiftedEnd.setDate(shiftedEnd.getDate() - 1);

  return { start: formatDate(shiftedStart), end: formatDate(shiftedEnd) };
};

const firstCloseOnOrAfter = (anchor: Date, closingDay: number): Date => {
  const year = anchor.getFullYear();
  const month = anchor.getMonth(); // 0-indexed
  const thisMonthClose = clampDate(year, month, closingDay);
  if (thisMonthClose >= anchor) return thisMonthClose;
  return clampDate(year, month + 1, closingDay);
};
```

Extend `PeriodInput`:

```ts
export interface PeriodInput {
  resetType: ResetType;
  resetConfig: ResetConfig;
  cardOpenDate?: string;
  statementClosingDay?: number;
}
```

Update the anniversary branch inside `getCurrentPeriodRange`:

```ts
    case "anniversary": {
      if (!input.cardOpenDate) return null;
      if (input.resetConfig.resetsAtStatementClose && input.statementClosingDay) {
        return getAnniversaryStatementClosingRange(today, input.cardOpenDate, input.statementClosingDay);
      }
      return getAnniversaryRange(today, input.cardOpenDate);
    }
```

- [ ] **Step 5: Run tests — verify they pass**

Run: `npm run test -- src/utils/period.test.ts`
Expected: all pass.

- [ ] **Step 6: Lint**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/models/types.ts src/utils/period.ts src/utils/period.test.ts
git commit -m "add statement-close aligned anniversary window helper"
```

---

## Task 2: Propagate `statementClosingDay` through callers

**Files:**
- Modify: `src/utils/period.ts` (`isBenefitUsedInPeriod`, `getDeadline`, `DeadlineInput`)
- Modify: `src/utils/reminder.ts`
- Modify: `src/stores/useCardStore.ts`
- Test: `src/utils/period.test.ts`, `src/utils/reminder.test.ts`, `src/stores/useCardStore.test.ts`

- [ ] **Step 1: Write failing integration-ish tests**

Append to `src/utils/period.test.ts`:

```ts
describe("isBenefitUsedInPeriod — statement close aware", () => {
  const today = new Date(2026, 5, 1);
  const benefit: Benefit = {
    id: "b", name: "Hotel", description: "", faceValue: 50,
    category: "hotel", resetType: "anniversary",
    resetConfig: { resetsAtStatementClose: true },
    isHidden: false, autoRecur: false, rolloverable: false, rolloverMaxYears: 0,
    usageRecords: [{ usedDate: "2026-04-05", faceValue: 50, actualValue: 50 }],
  };

  it("treats a record dated 2026-04-05 as LAST cycle's usage (before shifted start 2026-04-07)", () => {
    expect(isBenefitUsedInPeriod(benefit, today, "2025-04-03", 7)).toBe(false);
  });

  it("treats a record dated 2026-04-07 as CURRENT cycle's usage", () => {
    const b = { ...benefit, usageRecords: [{ usedDate: "2026-04-07", faceValue: 50, actualValue: 50 }] };
    expect(isBenefitUsedInPeriod(b, today, "2025-04-03", 7)).toBe(true);
  });
});

describe("getDeadline — statement close aware", () => {
  it("returns shifted end date when both card and benefit opt in", () => {
    const today = new Date(2026, 5, 1);
    expect(getDeadline(today, {
      resetType: "anniversary",
      resetConfig: { resetsAtStatementClose: true },
      cardOpenDate: "2025-04-03",
      statementClosingDay: 7,
    })).toBe("2027-04-06");
  });
});
```

- [ ] **Step 2: Extend signatures**

In `src/utils/period.ts`:

Change `isBenefitUsedInPeriod` signature:

```ts
export const isBenefitUsedInPeriod = (
  benefit: Benefit,
  today: Date,
  cardOpenDate?: string,
  statementClosingDay?: number,
): boolean => {
  // ... existing branches unchanged ...
  const range = getCurrentPeriodRange(today, {
    resetType, resetConfig, cardOpenDate, statementClosingDay,
  });
  // ... rest unchanged ...
};
```

Extend `DeadlineInput`:

```ts
export interface DeadlineInput {
  resetType: ResetType;
  resetConfig: ResetConfig;
  cardOpenDate?: string;
  autoRecur?: boolean;
  statementClosingDay?: number;
}
```

In `getDeadline`, the existing call `getCurrentPeriodRange(today, {...})` needs `statementClosingDay: input.statementClosingDay` added.

- [ ] **Step 3: Update callers**

In `src/stores/useCardStore.ts`, every call to `isBenefitUsedInPeriod(benefit, today, card.cardOpenDate)` becomes `isBenefitUsedInPeriod(benefit, today, card.cardOpenDate, card.statementClosingDay)`. Same for `getUnusedBenefitCount`.

In `src/utils/reminder.ts`, the call to `getDeadline(today, { ... cardOpenDate: card.cardOpenDate, autoRecur: benefit.autoRecur })` becomes `getDeadline(today, { ... cardOpenDate: card.cardOpenDate, autoRecur: benefit.autoRecur, statementClosingDay: card.statementClosingDay })`.

If `BenefitCard.tsx` passes anything to `getDeadline` directly, update there too (check with grep).

- [ ] **Step 4: Run tests**

Run: `npm run test`
Expected: all pass, including the new cases.

- [ ] **Step 5: Lint + commit**

```bash
npm run lint
git add src/utils/period.ts src/utils/reminder.ts src/stores/useCardStore.ts \
  src/views/shared/BenefitCard.tsx src/utils/period.test.ts
# include any other files actually touched
git commit -m "propagate statementClosingDay through period utility callers"
```

---

## Task 3: Card editor — statement closing day input

**Files:**
- Modify: `src/views/main/CardEditor.tsx`
- Test: `src/views/main/CardEditor.test.tsx`

- [ ] **Step 1: Failing test**

Append to `src/views/main/CardEditor.test.tsx`:

```ts
it("persists statementClosingDay when user enters it", async () => {
  const onSave = vi.fn();
  render(<CardEditor card={null} onSave={onSave} onCancel={() => {}} />);
  // Fill in required fields for save (adapt to the actual editor's flow).
  fireEvent.change(screen.getByTestId("card-open-date-input"), { target: { value: "2025-04-03" } });
  fireEvent.change(screen.getByTestId("statement-closing-day-input"), { target: { value: "7" } });
  fireEvent.click(screen.getByTestId("save-button"));
  await waitFor(() => expect(onSave).toHaveBeenCalled());
  expect(onSave.mock.calls[0][0].statementClosingDay).toBe(7);
});

it("omits statementClosingDay when input is empty", async () => {
  const onSave = vi.fn();
  render(<CardEditor card={null} onSave={onSave} onCancel={() => {}} />);
  fireEvent.change(screen.getByTestId("card-open-date-input"), { target: { value: "2025-04-03" } });
  fireEvent.click(screen.getByTestId("save-button"));
  await waitFor(() => expect(onSave).toHaveBeenCalled());
  expect(onSave.mock.calls[0][0].statementClosingDay).toBeUndefined();
});
```

(Adjust selectors to match the real editor's existing testids; if the editor uses form fields without testids, follow the existing pattern.)

- [ ] **Step 2: Implement**

In `src/views/main/CardEditor.tsx`:
- Add state `const [statementClosingDay, setStatementClosingDay] = useState<string>(card?.statementClosingDay?.toString() ?? "");`
- Add input JSX under the open-date input:

```tsx
<label>
  账单结算日 (1-31，可选)
  <input
    type="number"
    min={1}
    max={31}
    value={statementClosingDay}
    onChange={(e) => setStatementClosingDay(e.target.value)}
    data-testid="statement-closing-day-input"
    placeholder="例如 7"
  />
</label>
```

- In the save handler, parse: `const day = statementClosingDay === "" ? undefined : Number(statementClosingDay);` and include `statementClosingDay: day` in the card object passed to `onSave`. Skip the field entirely (undefined) when empty.

- [ ] **Step 3: Run tests + lint**

Run: `npm run test -- src/views/main/CardEditor.test.tsx && npm run lint`

- [ ] **Step 4: Commit**

```bash
git add src/views/main/CardEditor.tsx src/views/main/CardEditor.test.tsx
git commit -m "card editor: statement closing day optional input"
```

---

## Task 4: Benefit editor — resetsAtStatementClose checkbox

**Files:**
- Modify: `src/views/main/BenefitEditor.tsx`
- Test: `src/views/main/BenefitEditor.test.tsx`

- [ ] **Step 1: Failing test**

Append to `BenefitEditor.test.tsx`:

```ts
it("shows resetsAtStatementClose checkbox only when resetType=anniversary", () => {
  render(<BenefitEditor benefit={null} cardStatementClosingDay={7} onSave={() => {}} onCancel={() => {}} />);
  // Default resetType may not be anniversary — pick it.
  fireEvent.change(screen.getByTestId("reset-type-select"), { target: { value: "anniversary" } });
  expect(screen.getByTestId("resets-at-statement-close")).toBeInTheDocument();
});

it("hides the checkbox when resetType is not anniversary", () => {
  render(<BenefitEditor benefit={null} cardStatementClosingDay={7} onSave={() => {}} onCancel={() => {}} />);
  fireEvent.change(screen.getByTestId("reset-type-select"), { target: { value: "calendar" } });
  expect(screen.queryByTestId("resets-at-statement-close")).not.toBeInTheDocument();
});

it("disables the checkbox when cardStatementClosingDay is not set", () => {
  render(<BenefitEditor benefit={null} cardStatementClosingDay={undefined} onSave={() => {}} onCancel={() => {}} />);
  fireEvent.change(screen.getByTestId("reset-type-select"), { target: { value: "anniversary" } });
  const checkbox = screen.getByTestId<HTMLInputElement>("resets-at-statement-close");
  expect(checkbox.disabled).toBe(true);
});
```

- [ ] **Step 2: Implement**

Extend `BenefitEditor` props with `cardStatementClosingDay?: number` and thread it from callers.

Under the resetType-switched configuration UI, when `resetType === "anniversary"`, render:

```tsx
<label>
  <input
    type="checkbox"
    checked={resetsAtStatementClose}
    onChange={(e) => setResetsAtStatementClose(e.target.checked)}
    disabled={cardStatementClosingDay === undefined}
    data-testid="resets-at-statement-close"
  />
  按账单结算日对齐周期
  {cardStatementClosingDay === undefined && (
    <span className="hint"> (请先在卡片编辑器中设置账单结算日)</span>
  )}
</label>
```

State init: `const [resetsAtStatementClose, setResetsAtStatementClose] = useState(benefit?.resetConfig?.resetsAtStatementClose ?? false);`

In save handler, include in `resetConfig`:
```ts
resetConfig: { ...otherConfig, resetsAtStatementClose: resetsAtStatementClose || undefined }
```

(Use `undefined` when false so we don't bloat every benefit with a `false` field.)

- [ ] **Step 3: Thread prop from parent**

Search for `<BenefitEditor` call sites. Pass `cardStatementClosingDay={card.statementClosingDay}` from any parent that has card context. If a caller doesn't have card context, it's likely a card-agnostic flow — pass `undefined`.

- [ ] **Step 4: Run tests + lint + commit**

```bash
npm run test && npm run lint
git add src/views/main/BenefitEditor.tsx src/views/main/BenefitEditor.test.tsx \
  src/views/main/CardDetail.tsx # or wherever the prop is threaded from
git commit -m "benefit editor: resetsAtStatementClose option for anniversary benefits"
```

---

## Task 5: CSP hotel credit template + integration test

**Files:**
- Modify: wherever CSP templates live (`src/models/cardTypes/*.json` or similar — find via grep for `sapphire`).
- Test: `tests/store-integration.test.ts`

- [ ] **Step 1: Find CSP template location**

Run: `grep -r "sapphire" src/ --include="*.json" --include="*.ts"`

Locate the CSP hotel credit template. Typical shape: `{ name: "$50 Hotel Credit", resetType: "anniversary", ... }`.

- [ ] **Step 2: Add the flag**

Add `resetsAtStatementClose: true` to the template's `resetConfig`.

- [ ] **Step 3: Integration test**

Append to `tests/store-integration.test.ts`:

```ts
it("CSP $50 hotel credit uses statement-close aligned window when card has statementClosingDay", () => {
  useCardStore.setState({ cards: [] });

  const benefit: Benefit = {
    id: "b", name: "$50 Hotel Credit", description: "",
    faceValue: 50, category: "hotel",
    resetType: "anniversary",
    resetConfig: { resetsAtStatementClose: true },
    isHidden: false, autoRecur: false, rolloverable: false, rolloverMaxYears: 0,
    usageRecords: [{ usedDate: "2026-04-05", faceValue: 50, actualValue: 50 }],
  };
  const card: CreditCard = {
    id: "c", owner: "me", cardTypeSlug: "chase_sapphire_preferred",
    annualFee: 95, cardOpenDate: "2025-04-03",
    color: "#000", isEnabled: true, benefits: [benefit],
    statementClosingDay: 7,
  };
  useCardStore.setState({ cards: [card] });

  // Today = 2026-06-01. Shifted window = [2026-04-07, 2027-04-06].
  // Record dated 2026-04-05 is in PRIOR cycle, so CURRENT cycle is unused.
  // isBenefitUsedInPeriod call happens via getUnusedBenefitCount.
  const count = useCardStore.getState().getUnusedBenefitCount();
  expect(count).toBe(1);
});
```

(You may need `vi.setSystemTime(new Date(2026, 5, 1))` at the top of the test if the store uses a non-mockable `new Date()`. Check existing tests in this file for the pattern.)

- [ ] **Step 4: Run + lint + commit**

```bash
npm run test && npm run lint
git add <affected files>
git commit -m "CSP hotel credit opts into statement-close aligned window"
```

---

## Self-Review

- Spec coverage: data model, algorithm, fallback, UI for both card and benefit, template, tests — all present.
- No placeholders.
- Type consistency: `statementClosingDay` on `CreditCard`, `PeriodInput`, and `DeadlineInput`; `resetsAtStatementClose` on `ResetConfig` only.
- Tie-break: "on-or-after" is stated in algorithm and tested.
