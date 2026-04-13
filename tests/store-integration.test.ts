import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Benefit, CreditCard } from "../src/models/types";
import { useCardStore } from "../src/stores/useCardStore";
import { calculateCardROI, calculateDashboardROI } from "../src/utils/roi";
import { getBenefitsDueForReminder } from "../src/utils/reminder";
import { isBenefitUsedInPeriod } from "../src/utils/period";

// --- Helpers ---

const makeBenefit = (overrides: Partial<Benefit> = {}): Benefit => ({
  id: "b1",
  name: "Test Benefit",
  description: "",
  faceValue: 100,
  category: "other",
  resetType: "calendar",
  resetConfig: { period: "monthly" },
  isHidden: false,
  autoRecur: false,
  rolloverable: false,
  rolloverMaxYears: 2,
  usageRecords: [],
  ...overrides,
});

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

describe("Store + ROI integration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-10T12:00:00"));
    useCardStore.setState({
      cards: [],
      settings: useCardStore.getState().settings,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("add card → add benefits → toggle usage → ROI reflects actual values", () => {
    const store = useCardStore.getState();

    // Add card
    store.addCard(makeCard({ id: "c1", annualFee: 200, cardOpenDate: "2025-03-15" }));

    // Add two benefits
    useCardStore.getState().addBenefit(
      "c1",
      makeBenefit({ id: "b1", name: "Hotel Credit", faceValue: 150 }),
    );
    useCardStore.getState().addBenefit(
      "c1",
      makeBenefit({ id: "b2", name: "Dining Credit", faceValue: 100 }),
    );

    // Check off b1 with custom actual value
    useCardStore.getState().toggleBenefitUsage("c1", "b1", 120);

    // Verify usage record has faceValue snapshot, not actualValue
    const card = useCardStore.getState().cards[0];
    const b1 = card.benefits[0];
    expect(b1.usageRecords).toHaveLength(1);
    expect(b1.usageRecords[0].faceValue).toBe(150); // snapshot
    expect(b1.usageRecords[0].actualValue).toBe(120); // user input

    // Calculate ROI — should use actualValue for ROI
    const roi = calculateCardROI(card, new Date());
    expect(roi.actualReturn).toBe(120);
    expect(roi.faceValueReturn).toBe(150);
    expect(roi.isRecovered).toBe(false); // 120 < 200

    // Check off b2 at face value
    useCardStore.getState().toggleBenefitUsage("c1", "b2");
    const updatedCard = useCardStore.getState().cards[0];
    const roi2 = calculateCardROI(updatedCard, new Date());
    expect(roi2.actualReturn).toBe(220); // 120 + 100
    expect(roi2.isRecovered).toBe(true); // 220 >= 200
  });

  it("toggle usage on → undo → ROI returns to zero", () => {
    useCardStore.getState().addCard(makeCard({ id: "c1", annualFee: 100 }));
    useCardStore.getState().addBenefit("c1", makeBenefit({ id: "b1", faceValue: 50 }));

    // Toggle on
    useCardStore.getState().toggleBenefitUsage("c1", "b1");
    let card = useCardStore.getState().cards[0];
    expect(calculateCardROI(card, new Date()).actualReturn).toBe(50);

    // Undo
    useCardStore.getState().toggleBenefitUsage("c1", "b1");
    card = useCardStore.getState().cards[0];
    expect(calculateCardROI(card, new Date()).actualReturn).toBe(0);
  });

  it("faceValue snapshot survives benefit edit", () => {
    useCardStore.getState().addCard(makeCard({ id: "c1" }));
    useCardStore.getState().addBenefit("c1", makeBenefit({ id: "b1", faceValue: 200 }));

    // Check off at faceValue=200
    useCardStore.getState().toggleBenefitUsage("c1", "b1");

    // Edit benefit faceValue to 300
    useCardStore.setState((state) => ({
      cards: state.cards.map((c) => ({
        ...c,
        benefits: c.benefits.map((b) =>
          b.id === "b1" ? { ...b, faceValue: 300 } : b,
        ),
      })),
    }));

    // Record should still have original snapshot
    const record = useCardStore.getState().cards[0].benefits[0].usageRecords[0];
    expect(record.faceValue).toBe(200); // snapshot preserved
    expect(useCardStore.getState().cards[0].benefits[0].faceValue).toBe(300); // benefit updated
  });
});

describe("Store + Reminder integration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-25T12:00:00"));
    useCardStore.setState({
      cards: [],
      settings: useCardStore.getState().settings,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reminders reflect store state — unused benefits appear, used ones don't", () => {
    const card = makeCard({
      id: "c1",
      benefits: [
        makeBenefit({ id: "unused", name: "Unused Monthly" }),
        makeBenefit({
          id: "used",
          name: "Used Monthly",
          usageRecords: [{ usedDate: "2026-04-10", faceValue: 100, actualValue: 100 }],
        }),
      ],
    });
    useCardStore.getState().addCard(card);

    const reminders = getBenefitsDueForReminder(
      useCardStore.getState().cards,
      new Date(),
      7, // 7 days window — Apr 25, deadline Apr 30 = 5 days
    );

    expect(reminders).toHaveLength(1);
    expect(reminders[0].benefit.id).toBe("unused");
    expect(reminders[0].daysRemaining).toBe(5);
  });

  it("toggling usage removes benefit from reminders", () => {
    useCardStore.getState().addCard(makeCard({ id: "c1" }));
    useCardStore.getState().addBenefit("c1", makeBenefit({ id: "b1" }));

    // Before toggle — should appear in reminders
    let reminders = getBenefitsDueForReminder(useCardStore.getState().cards, new Date(), 7);
    expect(reminders).toHaveLength(1);

    // Toggle usage
    useCardStore.getState().toggleBenefitUsage("c1", "b1");

    // After toggle — should be gone
    reminders = getBenefitsDueForReminder(useCardStore.getState().cards, new Date(), 7);
    expect(reminders).toHaveLength(0);
  });

  it("hiding a benefit removes it from reminders but keeps it in ROI", () => {
    useCardStore.getState().addCard(makeCard({ id: "c1", annualFee: 100 }));
    useCardStore.getState().addBenefit("c1", makeBenefit({ id: "b1", faceValue: 50 }));

    // Use the benefit first
    useCardStore.getState().toggleBenefitUsage("c1", "b1");

    // Undo, then hide
    useCardStore.getState().toggleBenefitUsage("c1", "b1");
    useCardStore.getState().toggleBenefitHidden("c1", "b1");

    // Hidden = no reminders
    const reminders = getBenefitsDueForReminder(useCardStore.getState().cards, new Date(), 7);
    expect(reminders).toHaveLength(0);

    // But if we use it while hidden, it still counts for ROI
    useCardStore.getState().toggleBenefitUsage("c1", "b1");
    const card = useCardStore.getState().cards[0];
    const roi = calculateCardROI(card, new Date());
    expect(roi.actualReturn).toBe(50);
  });

  it("disabled card excluded from both reminders and dashboard ROI", () => {
    useCardStore.getState().addCard(
      makeCard({
        id: "c1",
        isEnabled: false,
        benefits: [makeBenefit({ id: "b1" })],
      }),
    );

    const reminders = getBenefitsDueForReminder(useCardStore.getState().cards, new Date(), 7);
    expect(reminders).toHaveLength(0);

    const dashboard = calculateDashboardROI(useCardStore.getState().cards, 2026);
    expect(dashboard.cards).toHaveLength(0);
    expect(dashboard.totalAnnualFee).toBe(0);
  });
});

describe("Auto-recur + ROI integration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-10T12:00:00"));
    useCardStore.setState({
      cards: [],
      settings: useCardStore.getState().settings,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("auto-recur generates records that contribute to dashboard ROI", () => {
    useCardStore.getState().addCard(
      makeCard({
        id: "c1",
        annualFee: 300,
        benefits: [
          makeBenefit({
            id: "sub1",
            name: "$25/mo Streaming",
            resetType: "subscription",
            autoRecur: true,
            faceValue: 25,
          }),
        ],
      }),
    );

    // Generate auto-recur for April
    useCardStore.getState().generateAutoRecurRecords();

    const card = useCardStore.getState().cards[0];
    expect(card.benefits[0].usageRecords).toHaveLength(1);

    // ROI should include auto-recur value
    const dashboard = calculateDashboardROI([card], 2026);
    expect(dashboard.totalActualValue).toBe(25);
  });

  it("auto-recur benefits excluded from unused count and reminders", () => {
    useCardStore.getState().addCard(
      makeCard({
        id: "c1",
        benefits: [
          makeBenefit({
            id: "sub1",
            resetType: "subscription",
            autoRecur: true,
            faceValue: 25,
          }),
        ],
      }),
    );

    expect(useCardStore.getState().getUnusedBenefitCount()).toBe(0);

    const reminders = getBenefitsDueForReminder(useCardStore.getState().cards, new Date(), 30);
    expect(reminders).toHaveLength(0);
  });
});

describe("JSON persistence round-trip", () => {
  beforeEach(() => {
    useCardStore.setState({
      cards: [],
      settings: useCardStore.getState().settings,
    });
  });

  it("multi-card multi-benefit state survives export → import", () => {
    // Build complex state
    useCardStore.getState().addCard(
      makeCard({
        id: "c1",
        alias: "白金卡",
        annualFee: 895,
        benefits: [
          makeBenefit({
            id: "b1",
            name: "Hotel H1",
            faceValue: 300,
            resetConfig: { period: "semi_annual", applicableMonths: [1, 2, 3, 4, 5, 6] },
            usageRecords: [{ usedDate: "2026-03-15", faceValue: 300, actualValue: 250 }],
          }),
          makeBenefit({
            id: "b2",
            name: "Streaming",
            resetType: "subscription",
            autoRecur: true,
            faceValue: 25,
            usageRecords: [
              { usedDate: "2026-01-01", faceValue: 25, actualValue: 25 },
              { usedDate: "2026-02-01", faceValue: 25, actualValue: 25 },
              { usedDate: "2026-03-01", faceValue: 25, actualValue: 25 },
            ],
          }),
        ],
      }),
    );
    useCardStore.getState().addCard(
      makeCard({
        id: "c2",
        cardTypeSlug: "chase_sapphire_reserve",
        annualFee: 795,
        isEnabled: false,
      }),
    );
    useCardStore.getState().updateSettings({ reminderDays: 5, logLevel: "debug" });

    // Snapshot original state
    const originalCards = structuredClone(useCardStore.getState().cards);
    const originalSettings = structuredClone(useCardStore.getState().settings);

    // Export
    const json = useCardStore.getState().exportData();

    // Clear state completely
    useCardStore.setState({ cards: [], settings: {
      logLevel: "info",
      debugLogEnabled: false,
      reminderEnabled: true,
      reminderDays: 3,
      dismissedDate: null,
    } });
    expect(useCardStore.getState().cards).toHaveLength(0);

    // Import
    useCardStore.getState().importData(json);

    // Verify deep equality
    expect(useCardStore.getState().cards).toEqual(originalCards);
    expect(useCardStore.getState().settings).toEqual(originalSettings);
  });

  it("malformed import preserves existing state", () => {
    useCardStore.getState().addCard(makeCard({ id: "precious" }));
    useCardStore.getState().updateSettings({ reminderDays: 10 });

    // Attempt bad imports
    const badInputs = [
      "not json at all",
      "null",
      JSON.stringify({ version: "wrong" }),
      JSON.stringify({ version: 1 }),
      JSON.stringify([1, 2, 3]),
    ];

    for (const bad of badInputs) {
      expect(() => {
        useCardStore.getState().importData(bad);
      }).toThrow();
    }

    // State should be intact
    expect(useCardStore.getState().cards).toHaveLength(1);
    expect(useCardStore.getState().cards[0].id).toBe("precious");
    expect(useCardStore.getState().settings.reminderDays).toBe(10);
  });
});

describe("Cross-module period + store integration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-10T12:00:00"));
    useCardStore.setState({
      cards: [],
      settings: useCardStore.getState().settings,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("one_time benefit: use → stays used forever → ROI counts it", () => {
    useCardStore.getState().addCard(makeCard({ id: "c1", annualFee: 95 }));
    useCardStore.getState().addBenefit(
      "c1",
      makeBenefit({
        id: "b1",
        name: "Global Entry",
        resetType: "one_time",
        resetConfig: {},
        faceValue: 100,
      }),
    );

    // Toggle on
    useCardStore.getState().toggleBenefitUsage("c1", "b1");
    const benefit = useCardStore.getState().cards[0].benefits[0];
    expect(isBenefitUsedInPeriod(benefit, new Date())).toBe(true);

    // Move time forward 6 months — still used
    vi.setSystemTime(new Date("2026-10-10T12:00:00"));
    expect(isBenefitUsedInPeriod(benefit, new Date())).toBe(true);

    // ROI in dashboard
    const dashboard = calculateDashboardROI(useCardStore.getState().cards, 2026);
    expect(dashboard.totalActualValue).toBe(100);
  });

  it("H1/H2 semi-annual benefits: H1 usage doesn't affect H2 period", () => {
    useCardStore.getState().addCard(makeCard({ id: "c1" }));
    useCardStore.getState().addBenefit(
      "c1",
      makeBenefit({
        id: "h1",
        name: "Hotel H1",
        faceValue: 300,
        resetConfig: { period: "semi_annual", applicableMonths: [1, 2, 3, 4, 5, 6] },
      }),
    );
    useCardStore.getState().addBenefit(
      "c1",
      makeBenefit({
        id: "h2",
        name: "Hotel H2",
        faceValue: 300,
        resetConfig: { period: "semi_annual", applicableMonths: [7, 8, 9, 10, 11, 12] },
      }),
    );

    // Use H1
    useCardStore.getState().toggleBenefitUsage("c1", "h1");

    // H1 is used, H2 is not applicable in April
    const card = useCardStore.getState().cards[0];
    expect(isBenefitUsedInPeriod(card.benefits[0], new Date(), card.cardOpenDate)).toBe(true);

    // Move to July — H1 usage from April shouldn't count in H2 period
    vi.setSystemTime(new Date("2026-07-10T12:00:00"));
    expect(isBenefitUsedInPeriod(card.benefits[0], new Date(), card.cardOpenDate)).toBe(false);

    // Unused count in July should be 1 (H2 only, H1 not applicable)
    expect(useCardStore.getState().getUnusedBenefitCount()).toBe(1);
  });
});
