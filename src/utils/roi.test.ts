import { describe, it, expect } from "vitest";
import type { CreditCard } from "../models/types";
import { getMembershipYearRange, calculateCardROI, calculateDashboardROI } from "./roi";

const d = (iso: string) => new Date(iso + "T00:00:00");

const makeCard = (overrides: Partial<CreditCard> = {}): CreditCard => ({
  id: "card-1",
  owner: "Test",
  cardTypeSlug: "amex_platinum",
  annualFee: 895,
  cardOpenDate: "2024-03-15",
  color: "#8E9EAF",
  isEnabled: true,
  benefits: [],
  ...overrides,
});

describe("getMembershipYearRange", () => {
  it("returns current membership year when today is after anniversary", () => {
    const range = getMembershipYearRange("2024-03-15", d("2026-04-10"));
    expect(range).toEqual({ start: "2026-03-15", end: "2027-03-14" });
  });

  it("returns previous membership year when today is before anniversary", () => {
    const range = getMembershipYearRange("2024-03-15", d("2026-02-10"));
    expect(range).toEqual({ start: "2025-03-15", end: "2026-03-14" });
  });

  it("applies yearOffset correctly", () => {
    const range = getMembershipYearRange("2024-03-15", d("2026-04-10"), -1);
    expect(range).toEqual({ start: "2025-03-15", end: "2026-03-14" });
  });
});

describe("calculateCardROI", () => {
  it("filters records by membership year and sums snapshot faceValue", () => {
    const card = makeCard({
      benefits: [
        {
          id: "b1",
          name: "Hotel Credit",
          description: "",
          faceValue: 999, // current value differs from snapshot
          category: "hotel",
          resetType: "calendar",
          resetConfig: { period: "annual" },
          isHidden: false,
          rolloverable: false,
          rolloverMaxYears: 0,
          usageRecords: [
            { usedDate: "2026-04-01", faceValue: 300, actualValue: 250 },
            { usedDate: "2026-05-01", faceValue: 300, actualValue: 300 },
            { usedDate: "2025-04-01", faceValue: 200, actualValue: 200 }, // prior year
          ],
        },
      ],
    });

    const roi = calculateCardROI(card, d("2026-04-10"));
    expect(roi.faceValueReturn).toBe(600);
    expect(roi.actualReturn).toBe(550);
    expect(roi.roiPercent).toBe(61); // 550/895 = 61.45 → 61
    expect(roi.isRecovered).toBe(false);
  });

  it("returns isRecovered=true when actual return meets annual fee", () => {
    const card = makeCard({
      annualFee: 95,
      benefits: [
        {
          id: "b1",
          name: "Credit",
          description: "",
          faceValue: 50,
          category: "hotel",
          resetType: "anniversary",
          resetConfig: {},
          isHidden: false,
          rolloverable: false,
          rolloverMaxYears: 0,
          usageRecords: [{ usedDate: "2026-04-01", faceValue: 50, actualValue: 100 }],
        },
      ],
    });

    const roi = calculateCardROI(card, d("2026-04-10"));
    expect(roi.isRecovered).toBe(true);
  });

  it("handles zero records with annualFee > 0", () => {
    const card = makeCard({ benefits: [] });
    const roi = calculateCardROI(card, d("2026-04-10"));
    expect(roi.faceValueReturn).toBe(0);
    expect(roi.actualReturn).toBe(0);
    expect(roi.roiPercent).toBe(0);
    expect(roi.isRecovered).toBe(false);
  });

  it("handles annualFee=0 (free card is always recovered)", () => {
    const card = makeCard({ annualFee: 0 });
    const roi = calculateCardROI(card, d("2026-04-10"));
    expect(roi.roiPercent).toBe(0);
    expect(roi.isRecovered).toBe(true);
  });

  it("handles cross-year membership range (Dec open date)", () => {
    const card = makeCard({
      cardOpenDate: "2024-12-15",
      benefits: [
        {
          id: "b1",
          name: "B1",
          description: "",
          faceValue: 100,
          category: "hotel",
          resetType: "anniversary",
          resetConfig: {},
          isHidden: false,
          rolloverable: false,
          rolloverMaxYears: 0,
          usageRecords: [
            { usedDate: "2026-01-10", faceValue: 100, actualValue: 100 },
          ],
        },
      ],
    });
    const roi = calculateCardROI(card, d("2026-04-10"));
    // Membership year: 2025-12-15 to 2026-12-14, record on 2026-01-10 is within
    expect(roi.actualReturn).toBe(100);
  });
});

describe("calculateDashboardROI", () => {
  it("aggregates multiple enabled cards by calendar year", () => {
    const cards = [
      makeCard({
        id: "c1",
        annualFee: 895,
        benefits: [
          {
            id: "b1",
            name: "B1",
            description: "",
            faceValue: 300,
            category: "hotel",
            resetType: "calendar",
            resetConfig: { period: "annual" },
            isHidden: false,
            rolloverable: false,
            rolloverMaxYears: 0,
            usageRecords: [{ usedDate: "2026-04-01", faceValue: 300, actualValue: 300 }],
          },
        ],
      }),
      makeCard({
        id: "c2",
        annualFee: 95,
        benefits: [
          {
            id: "b2",
            name: "B2",
            description: "",
            faceValue: 50,
            category: "hotel",
            resetType: "anniversary",
            resetConfig: {},
            isHidden: false,
            rolloverable: false,
            rolloverMaxYears: 0,
            usageRecords: [{ usedDate: "2026-05-01", faceValue: 50, actualValue: 50 }],
          },
        ],
      }),
    ];

    const dashboard = calculateDashboardROI(cards, 2026);
    expect(dashboard.totalAnnualFee).toBe(990);
    expect(dashboard.totalFaceValue).toBe(350);
    expect(dashboard.totalActualValue).toBe(350);
    expect(dashboard.cards).toHaveLength(2);
  });

  it("includes hidden benefits in ROI (per spec)", () => {
    const cards = [
      makeCard({
        benefits: [
          {
            id: "b1",
            name: "Hidden Benefit",
            description: "",
            faceValue: 200,
            category: "hotel",
            resetType: "calendar",
            resetConfig: { period: "annual" },
            isHidden: true,
            rolloverable: false,
            rolloverMaxYears: 0,
            usageRecords: [{ usedDate: "2026-04-01", faceValue: 200, actualValue: 200 }],
          },
        ],
      }),
    ];
    const dashboard = calculateDashboardROI(cards, 2026);
    expect(dashboard.totalActualValue).toBe(200);
  });

  it("excludes disabled cards", () => {
    const cards = [
      makeCard({ id: "c1", isEnabled: true, annualFee: 100 }),
      makeCard({ id: "c2", isEnabled: false, annualFee: 200 }),
    ];

    const dashboard = calculateDashboardROI(cards, 2026);
    expect(dashboard.totalAnnualFee).toBe(100);
    expect(dashboard.cards).toHaveLength(1);
  });
});

describe("calculateCardROI — anniversary window", () => {
  it("sums only records inside current anniversary window", () => {
    const today = new Date(2026, 3, 14); // 2026-04-14
    const card: CreditCard = {
      id: "c1",
      owner: "me",
      cardTypeSlug: "amex-plat",
      annualFee: 695,
      cardOpenDate: "2025-09-15",
      color: "#000",
      isEnabled: true,
      benefits: [
        {
          id: "b1",
          name: "X",
          description: "",
          faceValue: 100,
          category: "other",
          resetType: "calendar",
          resetConfig: { period: "monthly" },
          isHidden: false,
          rolloverable: false,
          rolloverMaxYears: 0,
          usageRecords: [
            { usedDate: "2025-08-01", faceValue: 100, actualValue: 100 }, // before window
            { usedDate: "2025-10-01", faceValue: 100, actualValue: 80 }, // inside
            { usedDate: "2026-03-01", faceValue: 100, actualValue: 90 }, // inside
            { usedDate: "2026-10-01", faceValue: 100, actualValue: 100 }, // after window
          ],
        },
      ],
    };
    const roi = calculateCardROI(card, today);
    expect(roi.faceValueReturn).toBe(200);
    expect(roi.actualReturn).toBe(170);
  });

  it("returns zero when current anniversary has no records yet", () => {
    const today = new Date(2026, 9, 1); // Oct 1
    const card: CreditCard = {
      id: "c1",
      owner: "me",
      cardTypeSlug: "x",
      annualFee: 500,
      cardOpenDate: "2026-09-15",
      color: "#000",
      isEnabled: true,
      benefits: [],
    };
    const roi = calculateCardROI(card, today);
    expect(roi.faceValueReturn).toBe(0);
    expect(roi.actualReturn).toBe(0);
    expect(roi.roiPercent).toBe(0);
  });

  it("dashboard ROI remains calendar-year", () => {
    const card: CreditCard = {
      id: "c1",
      owner: "me",
      cardTypeSlug: "x",
      annualFee: 100,
      cardOpenDate: "2025-09-15",
      color: "#000",
      isEnabled: true,
      benefits: [
        {
          id: "b1",
          name: "X",
          description: "",
          faceValue: 10,
          category: "other",
          resetType: "calendar",
          resetConfig: { period: "monthly" },
          isHidden: false,
          rolloverable: false,
          rolloverMaxYears: 0,
          usageRecords: [
            { usedDate: "2026-01-05", faceValue: 10, actualValue: 10 },
            { usedDate: "2026-02-05", faceValue: 10, actualValue: 10 },
          ],
        },
      ],
    };
    const dash = calculateDashboardROI([card], 2026);
    expect(dash.totalFaceValue).toBe(20);
    expect(dash.totalActualValue).toBe(20);
  });
});
