import { describe, expect, it } from "vitest";
import type { Benefit, CreditCard } from "../models/types";
import { migrateCards } from "./migrations";

// Legacy benefits on disk still carry autoRecur/cancelledMonths; tests feed
// them through migrateCards to verify the reader strips and converts them.
type LegacyBenefit = Benefit & { autoRecur?: boolean; cancelledMonths?: string[] };

const makeBenefit = (overrides: Partial<LegacyBenefit> = {}): LegacyBenefit => ({
  id: "b1",
  name: "benefit",
  description: "",
  faceValue: 0,
  category: "other",
  resetType: "one_time",
  resetConfig: {},
  isHidden: false,
  rolloverable: false,
  rolloverMaxYears: 0,
  usageRecords: [],
  ...overrides,
});

const makeCard = (benefits: LegacyBenefit[]): CreditCard => ({
  id: "c1",
  owner: "me",
  cardTypeSlug: "chase_marriott_boundless",
  annualFee: 95,
  cardOpenDate: "2024-01-01",
  color: "#000",
  isEnabled: true,
  benefits: benefits as Benefit[],
});

describe("migrateCards - Marriott H2 airline credit availableFromDate", () => {
  it("patches legacy H2 benefit without availableFromDate", () => {
    const benefit = makeBenefit({
      name: "$50 Airline Credit (H2 2026)",
      resetType: "one_time",
      resetConfig: { expiresDate: "2026-12-31" },
    });
    const [card] = migrateCards([makeCard([benefit])]);
    expect(card.benefits[0].resetConfig.availableFromDate).toBe("2026-07-01");
    expect(card.benefits[0].resetConfig.expiresDate).toBe("2026-12-31");
  });

  it("leaves H2 benefit alone when availableFromDate is already set", () => {
    const benefit = makeBenefit({
      name: "$50 Airline Credit (H2 2026)",
      resetType: "one_time",
      resetConfig: { availableFromDate: "2026-08-01", expiresDate: "2026-12-31" },
    });
    const [card] = migrateCards([makeCard([benefit])]);
    expect(card.benefits[0].resetConfig.availableFromDate).toBe("2026-08-01");
  });

  it("does not patch benefits with different names", () => {
    const benefit = makeBenefit({
      name: "$50 Airline Credit (H1 2026)",
      resetType: "one_time",
      resetConfig: { expiresDate: "2026-06-30" },
    });
    const [card] = migrateCards([makeCard([benefit])]);
    expect(card.benefits[0].resetConfig.availableFromDate).toBeUndefined();
  });

  it("is idempotent", () => {
    const benefit = makeBenefit({
      name: "$50 Airline Credit (H2 2026)",
      resetType: "one_time",
      resetConfig: { expiresDate: "2026-12-31" },
    });
    const once = migrateCards([makeCard([benefit])]);
    const twice = migrateCards(once);
    expect(twice[0].benefits[0].resetConfig.availableFromDate).toBe("2026-07-01");
    expect(twice).toEqual(once);
  });
});

describe("migrateCards - autoRecur → propagateNext", () => {
  it("sets propagateNext=true on monthly records for autoRecur=true benefits, except cancelledMonths", () => {
    const benefit = makeBenefit({
      name: "$25/mo Digital",
      resetType: "subscription",
      resetConfig: {},
      autoRecur: true,
      cancelledMonths: ["2026-02"],
      usageRecords: [
        { usedDate: "2026-01-05", faceValue: 25, actualValue: 25, kind: "usage" },
        { usedDate: "2026-02-10", faceValue: 25, actualValue: 20, kind: "usage" },
        { usedDate: "2026-03-03", faceValue: 25, actualValue: 25, kind: "usage" },
      ],
    });
    const [card] = migrateCards([makeCard([benefit])]);
    const [r1, r2, r3] = card.benefits[0].usageRecords;
    expect(r1.propagateNext).toBe(true);
    expect(r2.propagateNext).toBeUndefined();
    expect(r3.propagateNext).toBe(true);
    const migrated = card.benefits[0] as LegacyBenefit;
    expect(migrated.autoRecur).toBeUndefined();
    expect(migrated.cancelledMonths).toBeUndefined();
  });

  it("drops cancelledMonths even on autoRecur=false benefits", () => {
    const benefit = makeBenefit({
      resetType: "subscription",
      autoRecur: false,
      cancelledMonths: ["2026-01"],
      usageRecords: [{ usedDate: "2026-01-05", faceValue: 25, actualValue: 25, kind: "usage" }],
    });
    const [card] = migrateCards([makeCard([benefit])]);
    expect((card.benefits[0] as LegacyBenefit).cancelledMonths).toBeUndefined();
    expect(card.benefits[0].usageRecords[0].propagateNext).toBeUndefined();
  });

  it("leaves already-propagated records untouched (idempotent)", () => {
    const benefit = makeBenefit({
      resetType: "subscription",
      autoRecur: false,
      usageRecords: [
        { usedDate: "2026-03-01", faceValue: 25, actualValue: 25, propagateNext: true, kind: "usage" },
      ],
    });
    const once = migrateCards([makeCard([benefit])]);
    const twice = migrateCards(once);
    expect(twice).toEqual(once);
  });

  it("is idempotent when legacy fields already stripped", () => {
    const benefit = makeBenefit({
      resetType: "subscription",
      autoRecur: true,
      cancelledMonths: ["2026-02"],
      usageRecords: [
        { usedDate: "2026-01-05", faceValue: 25, actualValue: 25, kind: "usage" },
        { usedDate: "2026-02-10", faceValue: 25, actualValue: 20, kind: "usage" },
      ],
    });
    const once = migrateCards([makeCard([benefit])]);
    const twice = migrateCards(once);
    expect(twice).toEqual(once);
  });
});

describe("migrateCards - isRollover → kind", () => {
  type LegacyRecord = {
    usedDate: string;
    faceValue: number;
    actualValue: number;
    isRollover?: boolean;
    kind?: string;
  };

  it("converts legacy isRollover: true to kind: 'rollover', snaps usedDate to cycle start, and seeds faceValue=benefit.faceValue", () => {
    const benefit = makeBenefit({
      resetType: "calendar",
      resetConfig: { period: "quarterly" },
      faceValue: 150,
      rolloverable: true,
      rolloverMaxYears: 2,
      usageRecords: [
        { usedDate: "2025-03-14", faceValue: 0, actualValue: 0, isRollover: true } as LegacyRecord,
      ] as unknown as Benefit["usageRecords"],
    });
    const [card] = migrateCards([makeCard([benefit])]);
    const record = card.benefits[0].usageRecords[0];
    expect(record.kind).toBe("rollover");
    expect(record.usedDate).toBe("2025-01-01");
    // Legacy records had no amount; seed to benefit.faceValue so the new
    // sum-based math treats them as fully rolled (matches old semantics).
    expect(record.faceValue).toBe(150);
    expect("isRollover" in record).toBe(false);
  });

  it("tags legacy usage records as kind: 'usage' and strips any stray isRollover: false", () => {
    const benefit = makeBenefit({
      resetType: "calendar",
      resetConfig: { period: "monthly" },
      usageRecords: [
        { usedDate: "2026-03-05", faceValue: 25, actualValue: 25, isRollover: false } as LegacyRecord,
      ] as unknown as Benefit["usageRecords"],
    });
    const [card] = migrateCards([makeCard([benefit])]);
    const record = card.benefits[0].usageRecords[0];
    expect(record.kind).toBe("usage");
    expect(record.usedDate).toBe("2026-03-05");
    expect("isRollover" in record).toBe(false);
  });

  it("collapses duplicate legacy rollover records in the same cycle to one", () => {
    const benefit = makeBenefit({
      resetType: "calendar",
      resetConfig: { period: "semi_annual" },
      faceValue: 200,
      rolloverable: true,
      rolloverMaxYears: 2,
      usageRecords: [
        { usedDate: "2025-02-15", faceValue: 0, actualValue: 0, isRollover: true } as LegacyRecord,
        { usedDate: "2025-05-20", faceValue: 0, actualValue: 0, isRollover: true } as LegacyRecord,
      ] as unknown as Benefit["usageRecords"],
    });
    const [card] = migrateCards([makeCard([benefit])]);
    const rollovers = card.benefits[0].usageRecords.filter((r) => r.kind === "rollover");
    expect(rollovers).toHaveLength(1);
    expect(rollovers[0].usedDate).toBe("2025-01-01");
    expect(rollovers[0].faceValue).toBe(200);
  });

  it("leaves already-tagged kind records untouched (idempotent)", () => {
    const benefit = makeBenefit({
      resetType: "calendar",
      resetConfig: { period: "monthly" },
      usageRecords: [
        { usedDate: "2026-03-05", faceValue: 10, actualValue: 10, kind: "usage" },
      ],
    });
    const once = migrateCards([makeCard([benefit])]);
    const twice = migrateCards(once);
    expect(twice).toEqual(once);
    expect(once[0].benefits[0].usageRecords[0].usedDate).toBe("2026-03-05");
  });

  it("running migration twice on mixed legacy data produces identical output", () => {
    const benefit = makeBenefit({
      resetType: "calendar",
      resetConfig: { period: "quarterly" },
      faceValue: 100,
      rolloverable: true,
      rolloverMaxYears: 2,
      usageRecords: [
        { usedDate: "2025-03-14", faceValue: 0, actualValue: 0, isRollover: true } as LegacyRecord,
        { usedDate: "2025-06-20", faceValue: 100, actualValue: 80 } as LegacyRecord,
      ] as unknown as Benefit["usageRecords"],
    });
    const once = migrateCards([makeCard([benefit])]);
    const twice = migrateCards(once);
    expect(twice).toEqual(once);
  });
});

describe("migrateCards - backfillRolloverFaceValue", () => {
  it("seeds kind='rollover' records with faceValue=0 to benefit.faceValue", () => {
    // Post-kind-migration data on disk may still have faceValue=0 from before
    // the partial-amount model landed. This step ensures consumption math sees
    // a meaningful amount.
    const benefit = makeBenefit({
      resetType: "calendar",
      resetConfig: { period: "semi_annual" },
      faceValue: 300,
      rolloverable: true,
      rolloverMaxYears: 2,
      usageRecords: [
        { usedDate: "2025-07-01", faceValue: 0, actualValue: 0, kind: "rollover" },
      ],
    });
    const [card] = migrateCards([makeCard([benefit])]);
    expect(card.benefits[0].usageRecords[0].faceValue).toBe(300);
    expect(card.benefits[0].usageRecords[0].kind).toBe("rollover");
  });

  it("leaves already-nonzero rollover records untouched (new partial writes)", () => {
    const benefit = makeBenefit({
      resetType: "calendar",
      resetConfig: { period: "semi_annual" },
      faceValue: 300,
      rolloverable: true,
      rolloverMaxYears: 2,
      usageRecords: [
        { usedDate: "2025-07-01", faceValue: 50, actualValue: 0, kind: "rollover" },
      ],
    });
    const [card] = migrateCards([makeCard([benefit])]);
    expect(card.benefits[0].usageRecords[0].faceValue).toBe(50);
  });

  it("does not touch kind='usage' records even if faceValue=0", () => {
    // Non-face benefits have usage records with faceValue=0 by design.
    const benefit = makeBenefit({
      resetType: "calendar",
      resetConfig: { period: "monthly" },
      faceValue: 0,
      usageRecords: [
        { usedDate: "2026-01-05", faceValue: 0, actualValue: 0, kind: "usage" },
      ],
    });
    const [card] = migrateCards([makeCard([benefit])]);
    expect(card.benefits[0].usageRecords[0].faceValue).toBe(0);
    expect(card.benefits[0].usageRecords[0].kind).toBe("usage");
  });

  it("skips backfill when benefit.faceValue is 0 (no meaningful amount to seed)", () => {
    const benefit = makeBenefit({
      resetType: "calendar",
      resetConfig: { period: "monthly" },
      faceValue: 0,
      rolloverable: true,
      rolloverMaxYears: 1,
      usageRecords: [
        { usedDate: "2025-12-01", faceValue: 0, actualValue: 0, kind: "rollover" },
      ],
    });
    const [card] = migrateCards([makeCard([benefit])]);
    expect(card.benefits[0].usageRecords[0].faceValue).toBe(0);
  });

  it("is idempotent — re-running produces identical output", () => {
    const benefit = makeBenefit({
      resetType: "calendar",
      resetConfig: { period: "semi_annual" },
      faceValue: 300,
      rolloverable: true,
      rolloverMaxYears: 2,
      usageRecords: [
        { usedDate: "2025-07-01", faceValue: 0, actualValue: 0, kind: "rollover" },
      ],
    });
    const once = migrateCards([makeCard([benefit])]);
    const twice = migrateCards(once);
    expect(twice).toEqual(once);
    expect(once[0].benefits[0].usageRecords[0].faceValue).toBe(300);
  });
});
