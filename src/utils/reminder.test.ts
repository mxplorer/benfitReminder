import { describe, it, expect } from "vitest";
import type { Benefit, CreditCard } from "../models/types";
import { getBenefitsDueForReminder } from "./reminder";

const d = (iso: string) => new Date(iso + "T00:00:00");

const makeBenefit = (overrides: Partial<Benefit> = {}): Benefit => ({
  id: "b1",
  name: "Test Benefit",
  description: "",
  faceValue: 100,
  category: "other",
  resetType: "calendar",
  resetConfig: { period: "monthly" },
  isHidden: false,
  rolloverable: false,
  rolloverMaxYears: 2,
  usageRecords: [],
  ...overrides,
});

const makeCard = (
  benefits: Benefit[],
  overrides: Partial<CreditCard> = {},
): CreditCard => ({
  id: "card-1",
  owner: "Test",
  cardTypeSlug: "amex_platinum",
  annualFee: 895,
  cardOpenDate: "2024-03-15",
  color: "#8E9EAF",
  isEnabled: true,
  benefits,
  ...overrides,
});

describe("getBenefitsDueForReminder", () => {
  it("returns benefits within reminder window", () => {
    // April has 30 days, today is Apr 25, deadline Apr 30 → 5 days remaining
    const benefit = makeBenefit({ id: "b1", name: "Monthly Credit" });
    const card = makeCard([benefit]);
    const result = getBenefitsDueForReminder([card], d("2026-04-25"), 7);
    expect(result).toHaveLength(1);
    expect(result[0].daysRemaining).toBe(5);
    expect(result[0].deadline).toBe("2026-04-30");
  });

  it("excludes benefits outside reminder window", () => {
    // Apr 10, deadline Apr 30 → 20 days remaining, window is 7
    const benefit = makeBenefit();
    const card = makeCard([benefit]);
    const result = getBenefitsDueForReminder([card], d("2026-04-10"), 7);
    expect(result).toHaveLength(0);
  });

  it("excludes hidden benefits", () => {
    const benefit = makeBenefit({ isHidden: true });
    const card = makeCard([benefit]);
    const result = getBenefitsDueForReminder([card], d("2026-04-25"), 7);
    expect(result).toHaveLength(0);
  });

  it("includes monthly subscription when current month has no record and within window", () => {
    // Apr 25 → Apr 30 deadline → 5 days remaining, window 7
    const benefit = makeBenefit({
      resetType: "subscription",
      resetConfig: { period: "monthly" },
      usageRecords: [],
    });
    const card = makeCard([benefit]);
    const result = getBenefitsDueForReminder([card], d("2026-04-25"), 7);
    expect(result).toHaveLength(1);
    expect(result[0].deadline).toBe("2026-04-30");
    expect(result[0].daysRemaining).toBe(5);
  });

  it("excludes monthly subscription when current month already has a record", () => {
    const benefit = makeBenefit({
      resetType: "subscription",
      resetConfig: { period: "monthly" },
      usageRecords: [{ usedDate: "2026-04-01", faceValue: 100, actualValue: 100, kind: "usage" }],
    });
    const card = makeCard([benefit]);
    const result = getBenefitsDueForReminder([card], d("2026-04-25"), 7);
    expect(result).toHaveLength(0);
  });

  it("excludes already-used benefits", () => {
    const benefit = makeBenefit({
      usageRecords: [{ usedDate: "2026-04-05", faceValue: 100, actualValue: 100, kind: "usage" }],
    });
    const card = makeCard([benefit]);
    const result = getBenefitsDueForReminder([card], d("2026-04-25"), 7);
    expect(result).toHaveLength(0);
  });

  it("excludes benefits not applicable this month", () => {
    const benefit = makeBenefit({
      resetConfig: { period: "semi_annual", applicableMonths: [7, 8, 9, 10, 11, 12] },
    });
    const card = makeCard([benefit]);
    const result = getBenefitsDueForReminder([card], d("2026-04-25"), 7);
    expect(result).toHaveLength(0);
  });

  it("excludes disabled cards", () => {
    const benefit = makeBenefit();
    const card = makeCard([benefit], { isEnabled: false });
    const result = getBenefitsDueForReminder([card], d("2026-04-25"), 7);
    expect(result).toHaveLength(0);
  });

  it("includes one_time benefit approaching expiresDate", () => {
    const benefit = makeBenefit({
      resetType: "one_time",
      resetConfig: { expiresDate: "2026-04-30" },
      usageRecords: [],
    });
    const card = makeCard([benefit]);
    const result = getBenefitsDueForReminder([card], d("2026-04-25"), 7);
    expect(result).toHaveLength(1);
    expect(result[0].deadline).toBe("2026-04-30");
  });

  it("excludes one_time benefit already used", () => {
    const benefit = makeBenefit({
      resetType: "one_time",
      resetConfig: { expiresDate: "2026-04-30" },
      usageRecords: [{ usedDate: "2026-03-01", faceValue: 100, actualValue: 100, kind: "usage" }],
    });
    const card = makeCard([benefit]);
    const result = getBenefitsDueForReminder([card], d("2026-04-25"), 7);
    expect(result).toHaveLength(0);
  });

  it("excludes expired one_time benefit", () => {
    const benefit = makeBenefit({
      resetType: "one_time",
      resetConfig: { expiresDate: "2026-03-31" },
      usageRecords: [],
    });
    const card = makeCard([benefit]);
    const result = getBenefitsDueForReminder([card], d("2026-04-25"), 7);
    expect(result).toHaveLength(0);
  });

  it("excludes since_last_use benefits (no deadline)", () => {
    const benefit = makeBenefit({
      resetType: "since_last_use",
      resetConfig: { cooldownDays: 30 },
    });
    const card = makeCard([benefit]);
    const result = getBenefitsDueForReminder([card], d("2026-04-25"), 7);
    expect(result).toHaveLength(0);
  });

  it("includes subscription within reminder window", () => {
    const benefit = makeBenefit({
      resetType: "subscription",
      resetConfig: {},
    });
    const card = makeCard([benefit]);
    // Deadline is Apr 30, 5 days remaining
    const result = getBenefitsDueForReminder([card], d("2026-04-25"), 7);
    expect(result).toHaveLength(1);
  });

  it("sorts by daysRemaining ascending (most urgent first)", () => {
    const b1 = makeBenefit({ id: "b1", resetConfig: { period: "quarterly" } }); // deadline Jun 30 → 66 days
    const b2 = makeBenefit({ id: "b2", resetConfig: { period: "monthly" } }); // deadline Apr 30 → 5 days
    const card = makeCard([b1, b2]);
    const result = getBenefitsDueForReminder([card], d("2026-04-25"), 90);
    expect(result).toHaveLength(2);
    expect(result[0].benefit.id).toBe("b2"); // 5 days
    expect(result[1].benefit.id).toBe("b1"); // 66 days
  });
});
