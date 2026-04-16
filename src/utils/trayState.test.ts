import { describe, it, expect } from "vitest";
import type { Benefit, CreditCard } from "../models/types";
import { computeTrayStatus } from "./trayState";

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

describe("computeTrayStatus", () => {
  it("returns clean with no cards", () => {
    expect(computeTrayStatus([], d("2026-04-16"), 3)).toEqual({
      state: "clean",
      unusedCount: 0,
      urgentCount: 0,
    });
  });

  it("returns clean when all cards are disabled", () => {
    const card = makeCard([makeBenefit()], { isEnabled: false });
    expect(computeTrayStatus([card], d("2026-04-16"), 3).state).toBe("clean");
  });

  it("returns clean when only benefits are hidden", () => {
    const card = makeCard([makeBenefit({ isHidden: true })]);
    expect(computeTrayStatus([card], d("2026-04-16"), 3).state).toBe("clean");
  });

  it("returns unused for applicable unused benefit outside reminder window", () => {
    // Quarterly benefit, Apr 16 → quarter ends Jun 30 → 75 days remaining
    const benefit = makeBenefit({
      resetConfig: { period: "quarterly" },
    });
    const card = makeCard([benefit]);
    const status = computeTrayStatus([card], d("2026-04-16"), 3);
    expect(status).toEqual({ state: "unused", unusedCount: 1, urgentCount: 0 });
  });

  it("returns urgent when a benefit is inside the reminder window", () => {
    // Monthly benefit, Apr 28 → deadline Apr 30 → 2 days remaining
    const benefit = makeBenefit();
    const card = makeCard([benefit]);
    const status = computeTrayStatus([card], d("2026-04-28"), 3);
    expect(status).toEqual({ state: "urgent", unusedCount: 1, urgentCount: 1 });
  });

  it("treats the exact boundary (daysRemaining == reminderDays) as urgent", () => {
    // Monthly benefit, Apr 27 → deadline Apr 30 → 3 days remaining, reminderDays=3
    const benefit = makeBenefit();
    const card = makeCard([benefit]);
    expect(computeTrayStatus([card], d("2026-04-27"), 3).state).toBe("urgent");
  });

  it("prefers urgent over unused when mixed", () => {
    // One quarterly (far out) + one monthly (urgent)
    const far = makeBenefit({ id: "far", resetConfig: { period: "quarterly" } });
    const near = makeBenefit({ id: "near" });
    const card = makeCard([far, near]);
    const status = computeTrayStatus([card], d("2026-04-28"), 3);
    expect(status).toEqual({ state: "urgent", unusedCount: 2, urgentCount: 1 });
  });

  it("returns clean when the only applicable benefit has been used this period", () => {
    const benefit = makeBenefit({
      usageRecords: [{ usedDate: "2026-04-05", faceValue: 100, actualValue: 100 }],
    });
    const card = makeCard([benefit]);
    expect(computeTrayStatus([card], d("2026-04-16"), 3).state).toBe("clean");
  });

  it("reminderDays = 0 only flags same-day deadlines as urgent", () => {
    const benefit = makeBenefit();
    const card = makeCard([benefit]);
    // Apr 29 with reminderDays=0 → 1 day remaining → still unused, not urgent
    expect(computeTrayStatus([card], d("2026-04-29"), 0).state).toBe("unused");
    // Apr 30 with reminderDays=0 → 0 days → urgent
    expect(computeTrayStatus([card], d("2026-04-30"), 0).state).toBe("urgent");
  });
});
