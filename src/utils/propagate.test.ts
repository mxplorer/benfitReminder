import { describe, it, expect } from "vitest";
import type { Benefit, CreditCard, UsageRecord } from "../models/types";
import { materializeSubscriptionPropagation } from "./propagate";

const makeBenefit = (overrides: Partial<Benefit> = {}): Benefit => ({
  id: "b1",
  name: "Netflix",
  description: "",
  faceValue: 20,
  category: "streaming",
  resetType: "subscription",
  resetConfig: { period: "monthly" },
  isHidden: false,
  rolloverable: false,
  rolloverMaxYears: 0,
  usageRecords: [],
  ...overrides,
});

const makeCard = (overrides: Partial<CreditCard> = {}): CreditCard => ({
  id: "c1",
  owner: "Me",
  cardTypeSlug: "x",
  annualFee: 0,
  cardOpenDate: "2024-01-01",
  color: "#000",
  isEnabled: true,
  benefits: [],
  ...overrides,
});

const TODAY = new Date("2026-04-15T12:00:00"); // cycle = 2026-04-01

const record = (
  usedDate: string,
  opts: { propagateNext?: boolean; face?: number; actual?: number } = {},
): UsageRecord => ({
  usedDate,
  faceValue: opts.face ?? 20,
  actualValue: opts.actual ?? 13,
  kind: "usage",
  ...(opts.propagateNext !== undefined ? { propagateNext: opts.propagateNext } : {}),
});

describe("materializeSubscriptionPropagation", () => {
  it("no subscription benefits → returns cards unchanged (reference equality)", () => {
    const cards: CreditCard[] = [
      makeCard({ benefits: [makeBenefit({ resetType: "calendar" })] }),
    ];
    const out = materializeSubscriptionPropagation(cards, TODAY);
    expect(out).toBe(cards);
  });

  it("subscription benefit with no propagateNext records → unchanged (reference equality)", () => {
    const cards: CreditCard[] = [
      makeCard({
        benefits: [
          makeBenefit({
            usageRecords: [record("2026-02-01", { propagateNext: false })],
          }),
        ],
      }),
    ];
    const out = materializeSubscriptionPropagation(cards, TODAY);
    expect(out).toBe(cards);
  });

  it("last propagateNext record 2 months ago → materializes 2 records up to today's cycle", () => {
    const cards: CreditCard[] = [
      makeCard({
        benefits: [
          makeBenefit({
            usageRecords: [
              record("2026-02-01", { propagateNext: true, actual: 11 }),
            ],
          }),
        ],
      }),
    ];
    const out = materializeSubscriptionPropagation(cards, TODAY);
    const usage = out[0].benefits[0].usageRecords;
    expect(usage).toHaveLength(3);
    const dates = usage.map((r) => r.usedDate).sort();
    expect(dates).toEqual(["2026-02-01", "2026-03-01", "2026-04-01"]);
    for (const r of usage) {
      expect(r.actualValue).toBe(11);
      expect(r.propagateNext).toBe(true);
      expect(r.kind).toBe("usage");
    }
  });

  it("existing record at nextCycleStart → stops without overwriting", () => {
    const cards: CreditCard[] = [
      makeCard({
        benefits: [
          makeBenefit({
            usageRecords: [
              record("2026-02-01", { propagateNext: true, actual: 11 }),
              // user manually edited March — different actualValue, no propagateNext
              record("2026-03-01", { propagateNext: false, actual: 99 }),
            ],
          }),
        ],
      }),
    ];
    const out = materializeSubscriptionPropagation(cards, TODAY);
    const usage = out[0].benefits[0].usageRecords;
    // No April record materialized because March's propagateNext=false
    // breaks the chain.
    expect(usage).toHaveLength(2);
    const march = usage.find((r) => r.usedDate === "2026-03-01");
    expect(march?.actualValue).toBe(99);
  });

  it("propagateNext record IS today's cycle → no materialization (next > today)", () => {
    const cards: CreditCard[] = [
      makeCard({
        benefits: [
          makeBenefit({
            usageRecords: [record("2026-04-01", { propagateNext: true })],
          }),
        ],
      }),
    ];
    const out = materializeSubscriptionPropagation(cards, TODAY);
    expect(out).toBe(cards);
  });

  it("is idempotent — running twice produces identical output", () => {
    const cards: CreditCard[] = [
      makeCard({
        benefits: [
          makeBenefit({
            usageRecords: [
              record("2026-02-01", { propagateNext: true, actual: 11 }),
            ],
          }),
        ],
      }),
    ];
    const once = materializeSubscriptionPropagation(cards, TODAY);
    const twice = materializeSubscriptionPropagation(once, TODAY);
    expect(twice).toEqual(once);
    // Second run should not have produced new records, so reference equality
    // is safe to assert at the cards level.
    expect(twice).toBe(once);
  });

  it("multiple subscription benefits on same card → each handled independently", () => {
    const benefitA = makeBenefit({
      id: "b-a",
      usageRecords: [record("2026-02-01", { propagateNext: true, actual: 10 })],
    });
    const benefitB = makeBenefit({
      id: "b-b",
      usageRecords: [record("2026-03-01", { propagateNext: true, actual: 20 })],
    });
    const cards: CreditCard[] = [makeCard({ benefits: [benefitA, benefitB] })];
    const out = materializeSubscriptionPropagation(cards, TODAY);
    const [updA, updB] = out[0].benefits;
    expect(updA.usageRecords.map((r) => r.usedDate).sort()).toEqual([
      "2026-02-01",
      "2026-03-01",
      "2026-04-01",
    ]);
    expect(updA.usageRecords.every((r) => r.actualValue === 10)).toBe(true);
    expect(updB.usageRecords.map((r) => r.usedDate).sort()).toEqual([
      "2026-03-01",
      "2026-04-01",
    ]);
    expect(updB.usageRecords.every((r) => r.actualValue === 20)).toBe(true);
  });

  it("calendar/monthly benefit with propagateNext=true is NOT materialized", () => {
    const cards: CreditCard[] = [
      makeCard({
        benefits: [
          makeBenefit({
            resetType: "calendar",
            resetConfig: { period: "monthly" },
            usageRecords: [record("2026-02-01", { propagateNext: true })],
          }),
        ],
      }),
    ];
    const out = materializeSubscriptionPropagation(cards, TODAY);
    expect(out).toBe(cards);
    expect(out[0].benefits[0].usageRecords).toHaveLength(1);
  });

  it("chain of 5 cycles → fixpoint materializes 5 records", () => {
    const today = new Date("2026-06-15T12:00:00"); // cycle = 2026-06-01
    const cards: CreditCard[] = [
      makeCard({
        benefits: [
          makeBenefit({
            usageRecords: [record("2026-01-01", { propagateNext: true, actual: 7 })],
          }),
        ],
      }),
    ];
    const out = materializeSubscriptionPropagation(cards, today);
    const usage = out[0].benefits[0].usageRecords;
    expect(usage.map((r) => r.usedDate).sort()).toEqual([
      "2026-01-01",
      "2026-02-01",
      "2026-03-01",
      "2026-04-01",
      "2026-05-01",
      "2026-06-01",
    ]);
    expect(usage.every((r) => r.actualValue === 7)).toBe(true);
    expect(usage.every((r) => r.propagateNext === true)).toBe(true);
  });

  it("faceValue and actualValue are carried forward from the source record", () => {
    const cards: CreditCard[] = [
      makeCard({
        benefits: [
          makeBenefit({
            faceValue: 20,
            usageRecords: [
              record("2026-02-01", { propagateNext: true, face: 17, actual: 9 }),
            ],
          }),
        ],
      }),
    ];
    const out = materializeSubscriptionPropagation(cards, TODAY);
    const materialized = out[0].benefits[0].usageRecords.filter(
      (r) => r.usedDate !== "2026-02-01",
    );
    expect(materialized.length).toBeGreaterThan(0);
    for (const r of materialized) {
      expect(r.faceValue).toBe(17);
      expect(r.actualValue).toBe(9);
    }
  });

  it("year-boundary: December source propagates into January of next year", () => {
    const today = new Date("2026-02-10T12:00:00"); // cycle = 2026-02-01
    const cards: CreditCard[] = [
      makeCard({
        benefits: [
          makeBenefit({
            usageRecords: [record("2025-12-01", { propagateNext: true, actual: 15 })],
          }),
        ],
      }),
    ];
    const out = materializeSubscriptionPropagation(cards, today);
    const usage = out[0].benefits[0].usageRecords;
    expect(usage.map((r) => r.usedDate).sort()).toEqual([
      "2025-12-01",
      "2026-01-01",
      "2026-02-01",
    ]);
  });

  it("does not mutate input cards or benefits arrays", () => {
    const benefit = makeBenefit({
      usageRecords: [record("2026-02-01", { propagateNext: true })],
    });
    const card = makeCard({ benefits: [benefit] });
    const cards = [card];
    const before = JSON.stringify(cards);
    materializeSubscriptionPropagation(cards, TODAY);
    expect(JSON.stringify(cards)).toBe(before);
    expect(benefit.usageRecords).toHaveLength(1); // untouched
  });
});
