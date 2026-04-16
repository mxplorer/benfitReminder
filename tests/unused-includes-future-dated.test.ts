import { describe, it, expect } from "vitest";
import type { Benefit, CreditCard } from "../src/models/types";
import { expandBenefitsForFilter } from "../src/utils/benefitDisplay";
import { computeTrayStatus } from "../src/utils/trayState";

const d = (iso: string) => new Date(iso + "T00:00:00");

const futureDatedH2Benefit: Benefit = {
  id: "b-airline-h2",
  name: "$50 Airline Credit (H2 2026)",
  description: "Promotional half-year airline credit",
  faceValue: 50,
  category: "airline",
  resetType: "one_time",
  resetConfig: {
    availableFromDate: "2026-07-01",
    expiresDate: "2026-12-31",
  },
  isHidden: false,
  rolloverable: false,
  rolloverMaxYears: 0,
  usageRecords: [],
};

const marriottCard: CreditCard = {
  id: "card-marriott",
  owner: "Test",
  cardTypeSlug: "chase_marriott_boundless",
  annualFee: 95,
  cardOpenDate: "2024-05-10",
  color: "#8E9EAF",
  isEnabled: true,
  benefits: [futureDatedH2Benefit],
};

describe("unused views include future-dated one_time benefits", () => {
  const today = d("2026-04-16");

  it("expandBenefitsForFilter('unused') lists the future-dated H2 airline credit", () => {
    const items = expandBenefitsForFilter(marriottCard, "unused", today, "calendar");
    expect(items.map((i) => i.benefit.id)).toContain(futureDatedH2Benefit.id);
  });

  it("expandBenefitsForFilter('available') does NOT list the future-dated H2 airline credit", () => {
    // The 可使用 filter keeps isApplicableNow semantics: only items usable right now.
    const items = expandBenefitsForFilter(marriottCard, "available", today, "calendar");
    expect(items.map((i) => i.benefit.id)).not.toContain(futureDatedH2Benefit.id);
  });

  it("computeTrayStatus counts the future-dated H2 benefit as unused", () => {
    const status = computeTrayStatus([marriottCard], today, 7);
    expect(status.unusedCount).toBe(1);
    expect(status.state).toBe("unused");
  });

  it("does not list a one_time benefit that expired before today", () => {
    const expiredBenefit: Benefit = {
      ...futureDatedH2Benefit,
      id: "b-expired",
      resetConfig: {
        availableFromDate: "2025-07-01",
        expiresDate: "2025-12-31",
      },
    };
    const card: CreditCard = { ...marriottCard, benefits: [expiredBenefit] };
    const items = expandBenefitsForFilter(card, "unused", today, "calendar");
    expect(items.map((i) => i.benefit.id)).not.toContain(expiredBenefit.id);
  });
});
