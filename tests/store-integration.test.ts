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
          usageRecords: [{ usedDate: "2026-04-10", faceValue: 100, actualValue: 100, kind: "usage" }],
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
    // Seed a prev-month record with propagateNext=true so the new model propagates
    useCardStore.setState({
      cards: [makeCard({
        id: "c1",
        annualFee: 300,
        benefits: [
          makeBenefit({
            id: "sub1",
            name: "$25/mo Streaming",
            resetType: "subscription",
            faceValue: 25,
            usageRecords: [
              { usedDate: "2026-03-01", faceValue: 25, actualValue: 25, propagateNext: true, kind: "usage" },
            ],
          }),
        ],
      })],
      now: new Date("2026-04-10T12:00:00"),
    });

    // Generate auto-recur for April
    useCardStore.getState().generateAutoRecurRecords();

    const card = useCardStore.getState().cards[0];
    expect(card.benefits[0].usageRecords).toHaveLength(2);

    // ROI should include auto-recur values; both Mar and Apr records count for 2026
    const dashboard = calculateDashboardROI([card], 2026);
    expect(dashboard.totalActualValue).toBe(50);
  });

  it("monthly sub counts as unused when no record in current month", () => {
    useCardStore.getState().addCard(
      makeCard({
        id: "c1",
        benefits: [
          makeBenefit({
            id: "sub1",
            resetType: "subscription",
            faceValue: 25,
          }),
        ],
      }),
    );

    // Monthly subs are countable when unused.
    expect(useCardStore.getState().getUnusedBenefitCount()).toBe(1);

    // Reminders fire for monthly subs without a record this month
    // (system time Apr 10 → deadline Apr 30 = 20 days, within reminderDays=30 window).
    const reminders = getBenefitsDueForReminder(useCardStore.getState().cards, new Date(), 30);
    expect(reminders).toHaveLength(1);
  });
});

describe("JSON persistence round-trip", () => {
  beforeEach(() => {
    // Freeze to a date within the last seeded subscription cycle so that
    // the batch-6 importData materialization step has nothing to do; this
    // lets us keep asserting deep equality across round-trip.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T12:00:00"));
    useCardStore.setState({
      cards: [],
      settings: useCardStore.getState().settings,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
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
            usageRecords: [{ usedDate: "2026-03-15", faceValue: 300, actualValue: 250, kind: "usage" }],
          }),
          makeBenefit({
            id: "b2",
            name: "Streaming",
            resetType: "subscription",
            faceValue: 25,
            usageRecords: [
              { usedDate: "2026-01-01", faceValue: 25, actualValue: 25, propagateNext: true, kind: "usage" },
              { usedDate: "2026-02-01", faceValue: 25, actualValue: 25, propagateNext: true, kind: "usage" },
              { usedDate: "2026-03-01", faceValue: 25, actualValue: 25, propagateNext: true, kind: "usage" },
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
      trayOpacity: 100,
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

describe("auto-replicate subscription flow", () => {
  beforeEach(() => {
    useCardStore.setState({ cards: [] });
  });

  it("replicates previous month's actualValue using propagateNext; uncheck removes record; re-run recreates from propagateNext", () => {
    const today = new Date();
    const yr = today.getFullYear();
    const mo = today.getMonth() + 1;
    const monthStart = `${String(yr)}-${String(mo).padStart(2, "0")}-01`;
    const lastMonthDate = new Date(yr, mo - 2, 1);
    const lastMonthStart = `${String(lastMonthDate.getFullYear())}-${String(lastMonthDate.getMonth() + 1).padStart(2, "0")}-01`;
    const monthEndDay = new Date(yr, mo, 0).getDate();
    const monthEnd = `${String(yr)}-${String(mo).padStart(2, "0")}-${String(monthEndDay).padStart(2, "0")}`;

    const benefit: Benefit = {
      id: "b", name: "Netflix", description: "", faceValue: 20,
      category: "streaming", resetType: "subscription",
      resetConfig: { period: "monthly" },
      isHidden: false, rolloverable: false, rolloverMaxYears: 0,
      usageRecords: [{ usedDate: lastMonthStart, faceValue: 20, actualValue: 13, propagateNext: true, kind: "usage" }],
    };
    const card: CreditCard = {
      id: "c", owner: "me", cardTypeSlug: "x", annualFee: 0,
      cardOpenDate: "2024-01-01", color: "#000", isEnabled: true, benefits: [benefit],
    };
    useCardStore.setState({ cards: [card], now: today });

    // Step 1: generate replicates actualValue=13, not faceValue=20.
    useCardStore.getState().generateAutoRecurRecords();
    let updated = useCardStore.getState().cards[0].benefits[0];
    expect(updated.usageRecords).toHaveLength(2);
    expect(
      updated.usageRecords.find((r) => r.usedDate === monthStart)?.actualValue,
    ).toBe(13);

    // Step 2: user unchecks current month → record removed.
    useCardStore.getState().setBenefitCycleUsed("c", "b", monthStart, monthEnd, false);
    updated = useCardStore.getState().cards[0].benefits[0];
    expect(updated.usageRecords.some((r) => r.usedDate === monthStart)).toBe(false);

    // Step 3: generate runs again → recreates because prev month still has propagateNext=true.
    useCardStore.getState().generateAutoRecurRecords();
    updated = useCardStore.getState().cards[0].benefits[0];
    expect(updated.usageRecords.some((r) => r.usedDate === monthStart)).toBe(true);

    // Step 4: user re-checks → record present for current month.
    useCardStore.getState().setBenefitCycleUsed("c", "b", monthStart, monthEnd, true);
    updated = useCardStore.getState().cards[0].benefits[0];
    expect(
      updated.usageRecords.some(
        (r) => r.usedDate >= monthStart && r.usedDate <= monthEnd,
      ),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Batch 2: record-level primary API
// ---------------------------------------------------------------------------

describe("addBenefitUsage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-10T12:00:00"));
    useCardStore.setState({ cards: [], settings: useCardStore.getState().settings });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("appends a record with full face consumption", () => {
    useCardStore.getState().addCard(makeCard({ id: "c1" }));
    useCardStore.getState().addBenefit("c1", makeBenefit({ id: "b1", faceValue: 200 }));

    useCardStore.getState().addBenefitUsage("c1", "b1", {
      consumedFace: 200,
      actualValue: 180,
      usedDate: "2026-04-05",
    });

    const records = useCardStore.getState().cards[0].benefits[0].usageRecords;
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      usedDate: "2026-04-05",
      faceValue: 200,
      actualValue: 180,
      kind: "usage",
    });
  });

  it("stores consumedFace at record.faceValue for partial face", () => {
    useCardStore.getState().addCard(makeCard({ id: "c1" }));
    useCardStore.getState().addBenefit("c1", makeBenefit({ id: "b1", faceValue: 200 }));

    useCardStore.getState().addBenefitUsage("c1", "b1", {
      consumedFace: 50,
      actualValue: 45,
      usedDate: "2026-04-05",
    });

    const record = useCardStore.getState().cards[0].benefits[0].usageRecords[0];
    expect(record.faceValue).toBe(50);
    expect(record.actualValue).toBe(45);
  });

  it("appends multiple records in the same cycle", () => {
    useCardStore.getState().addCard(makeCard({ id: "c1" }));
    useCardStore.getState().addBenefit("c1", makeBenefit({ id: "b1", faceValue: 200 }));

    useCardStore.getState().addBenefitUsage("c1", "b1", {
      consumedFace: 50,
      actualValue: 50,
      usedDate: "2026-04-05",
    });
    useCardStore.getState().addBenefitUsage("c1", "b1", {
      consumedFace: 75,
      actualValue: 75,
      usedDate: "2026-04-08",
    });

    const records = useCardStore.getState().cards[0].benefits[0].usageRecords;
    expect(records).toHaveLength(2);
    expect(records.map((r) => r.faceValue)).toEqual([50, 75]);
  });

  it("clamps out-of-cycle usedDate to today", () => {
    useCardStore.getState().addCard(makeCard({ id: "c1" }));
    useCardStore.getState().addBenefit("c1", makeBenefit({ id: "b1", faceValue: 100 }));

    useCardStore.getState().addBenefitUsage("c1", "b1", {
      consumedFace: 100,
      actualValue: 100,
      // Last year — different cycle key for monthly reset.
      usedDate: "2025-04-05",
    });

    const record = useCardStore.getState().cards[0].benefits[0].usageRecords[0];
    // System time is 2026-04-10, which is the "today" fallback.
    expect(record.usedDate).toBe("2026-04-10");
  });

  it("keeps propagateNext when provided explicitly false", () => {
    useCardStore.getState().addCard(makeCard({ id: "c1" }));
    useCardStore.getState().addBenefit(
      "c1",
      makeBenefit({ id: "b1", resetType: "subscription", faceValue: 25 }),
    );

    useCardStore.getState().addBenefitUsage("c1", "b1", {
      consumedFace: 25,
      actualValue: 25,
      usedDate: "2026-04-01",
      propagateNext: false,
    });

    const record = useCardStore.getState().cards[0].benefits[0].usageRecords[0];
    expect(record.propagateNext).toBe(false);
  });
});

describe("addCycleUsage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-10T12:00:00"));
    useCardStore.setState({ cards: [], settings: useCardStore.getState().settings });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("adds to past cycle with usedDate defaulting to cycleStart", () => {
    useCardStore.getState().addCard(makeCard({ id: "c1" }));
    useCardStore.getState().addBenefit("c1", makeBenefit({ id: "b1", faceValue: 100 }));

    // Feb 2026 is past (today = Apr 10 2026).
    useCardStore.getState().addCycleUsage("c1", "b1", "2026-02-01", "2026-02-28", {
      consumedFace: 100,
      actualValue: 90,
    });

    const record = useCardStore.getState().cards[0].benefits[0].usageRecords[0];
    expect(record.usedDate).toBe("2026-02-01");
    expect(record.faceValue).toBe(100);
    expect(record.actualValue).toBe(90);
  });

  it("adds to current cycle with usedDate defaulting to today", () => {
    useCardStore.getState().addCard(makeCard({ id: "c1" }));
    useCardStore.getState().addBenefit("c1", makeBenefit({ id: "b1", faceValue: 100 }));

    useCardStore.getState().addCycleUsage("c1", "b1", "2026-04-01", "2026-04-30", {
      consumedFace: 100,
      actualValue: 100,
    });

    const record = useCardStore.getState().cards[0].benefits[0].usageRecords[0];
    expect(record.usedDate).toBe("2026-04-10");
  });

  it("clamps out-of-cycle usedDate to cycleStart when today is not in cycle", () => {
    useCardStore.getState().addCard(makeCard({ id: "c1" }));
    useCardStore.getState().addBenefit("c1", makeBenefit({ id: "b1", faceValue: 100 }));

    useCardStore.getState().addCycleUsage("c1", "b1", "2026-02-01", "2026-02-28", {
      consumedFace: 100,
      actualValue: 100,
      // Apr 2026 is a different cycle.
      usedDate: "2026-04-05",
    });

    const record = useCardStore.getState().cards[0].benefits[0].usageRecords[0];
    expect(record.usedDate).toBe("2026-02-01");
  });

  it("clamps out-of-cycle usedDate to today when today is in cycle", () => {
    useCardStore.getState().addCard(makeCard({ id: "c1" }));
    useCardStore.getState().addBenefit("c1", makeBenefit({ id: "b1", faceValue: 100 }));

    useCardStore.getState().addCycleUsage("c1", "b1", "2026-04-01", "2026-04-30", {
      consumedFace: 100,
      actualValue: 100,
      // Feb 2026 is a different cycle; current cycle is April, today = Apr 10.
      usedDate: "2026-02-05",
    });

    const record = useCardStore.getState().cards[0].benefits[0].usageRecords[0];
    expect(record.usedDate).toBe("2026-04-10");
  });
});

describe("removeBenefitUsageRecord", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-10T12:00:00"));
    useCardStore.setState({ cards: [], settings: useCardStore.getState().settings });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("removes exact record at the given index", () => {
    useCardStore.getState().addCard(makeCard({ id: "c1" }));
    useCardStore.getState().addBenefit(
      "c1",
      makeBenefit({
        id: "b1",
        faceValue: 100,
        usageRecords: [
          { usedDate: "2026-04-01", faceValue: 50, actualValue: 50, kind: "usage" },
          { usedDate: "2026-04-05", faceValue: 60, actualValue: 60, kind: "usage" },
          { usedDate: "2026-04-10", faceValue: 70, actualValue: 70, kind: "usage" },
        ],
      }),
    );

    useCardStore.getState().removeBenefitUsageRecord("c1", "b1", 1);

    const records = useCardStore.getState().cards[0].benefits[0].usageRecords;
    expect(records).toHaveLength(2);
    expect(records.map((r) => r.actualValue)).toEqual([50, 70]);
  });

  it("is a no-op for out-of-range indices", () => {
    useCardStore.getState().addCard(makeCard({ id: "c1" }));
    useCardStore.getState().addBenefit(
      "c1",
      makeBenefit({
        id: "b1",
        usageRecords: [{ usedDate: "2026-04-05", faceValue: 50, actualValue: 50, kind: "usage" }],
      }),
    );

    useCardStore.getState().removeBenefitUsageRecord("c1", "b1", 5);
    useCardStore.getState().removeBenefitUsageRecord("c1", "b1", -1);

    expect(useCardStore.getState().cards[0].benefits[0].usageRecords).toHaveLength(1);
  });

  it("works for both usage and rollover records", () => {
    useCardStore.getState().addCard(makeCard({ id: "c1" }));
    useCardStore.getState().addBenefit(
      "c1",
      makeBenefit({
        id: "b1",
        rolloverable: true,
        usageRecords: [
          { usedDate: "2026-04-01", faceValue: 0, actualValue: 0, kind: "rollover" },
          { usedDate: "2026-04-05", faceValue: 50, actualValue: 50, kind: "usage" },
        ],
      }),
    );

    useCardStore.getState().removeBenefitUsageRecord("c1", "b1", 0);

    const records = useCardStore.getState().cards[0].benefits[0].usageRecords;
    expect(records).toHaveLength(1);
    expect(records[0].kind).toBe("usage");
  });
});

describe("updateBenefitUsageRecord", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-10T12:00:00"));
    useCardStore.setState({ cards: [], settings: useCardStore.getState().settings });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const seedRecord = () => {
    useCardStore.getState().addCard(makeCard({ id: "c1" }));
    useCardStore.getState().addBenefit(
      "c1",
      makeBenefit({
        id: "b1",
        faceValue: 100,
        usageRecords: [
          {
            usedDate: "2026-04-05",
            faceValue: 50,
            actualValue: 45,
            kind: "usage",
            propagateNext: true,
          },
        ],
      }),
    );
  };

  it("updates actualValue", () => {
    seedRecord();
    useCardStore.getState().updateBenefitUsageRecord("c1", "b1", 0, { actualValue: 99 });
    const r = useCardStore.getState().cards[0].benefits[0].usageRecords[0];
    expect(r.actualValue).toBe(99);
    // Other fields untouched.
    expect(r.faceValue).toBe(50);
    expect(r.usedDate).toBe("2026-04-05");
    expect(r.propagateNext).toBe(true);
  });

  it("updates consumedFace (stored as record.faceValue)", () => {
    seedRecord();
    useCardStore.getState().updateBenefitUsageRecord("c1", "b1", 0, { consumedFace: 80 });
    const r = useCardStore.getState().cards[0].benefits[0].usageRecords[0];
    expect(r.faceValue).toBe(80);
  });

  it("updates usedDate", () => {
    seedRecord();
    useCardStore.getState().updateBenefitUsageRecord("c1", "b1", 0, { usedDate: "2026-04-09" });
    const r = useCardStore.getState().cards[0].benefits[0].usageRecords[0];
    expect(r.usedDate).toBe("2026-04-09");
  });

  it("updates propagateNext including explicit false", () => {
    seedRecord();
    useCardStore.getState().updateBenefitUsageRecord("c1", "b1", 0, { propagateNext: false });
    const r = useCardStore.getState().cards[0].benefits[0].usageRecords[0];
    expect(r.propagateNext).toBe(false);
  });

  it("is a no-op for out-of-range indices", () => {
    seedRecord();
    useCardStore.getState().updateBenefitUsageRecord("c1", "b1", 5, { actualValue: 1 });
    useCardStore.getState().updateBenefitUsageRecord("c1", "b1", -1, { actualValue: 1 });
    const r = useCardStore.getState().cards[0].benefits[0].usageRecords[0];
    expect(r.actualValue).toBe(45);
  });

  it("partial patch leaves untouched fields alone", () => {
    seedRecord();
    useCardStore
      .getState()
      .updateBenefitUsageRecord("c1", "b1", 0, { actualValue: 10, consumedFace: 20 });
    const r = useCardStore.getState().cards[0].benefits[0].usageRecords[0];
    expect(r.actualValue).toBe(10);
    expect(r.faceValue).toBe(20);
    expect(r.usedDate).toBe("2026-04-05");
    expect(r.propagateNext).toBe(true);
    expect(r.kind).toBe("usage");
  });
});

describe("removeCycleRecords", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-10T12:00:00"));
    useCardStore.setState({ cards: [], settings: useCardStore.getState().settings });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("removes all records (usage + rollover) matching the cycle and leaves other cycles untouched", () => {
    useCardStore.getState().addCard(makeCard({ id: "c1" }));
    useCardStore.getState().addBenefit(
      "c1",
      makeBenefit({
        id: "b1",
        rolloverable: true,
        faceValue: 100,
        usageRecords: [
          { usedDate: "2026-03-01", faceValue: 100, actualValue: 100, kind: "usage" },
          { usedDate: "2026-04-01", faceValue: 0, actualValue: 0, kind: "rollover" },
          { usedDate: "2026-04-05", faceValue: 40, actualValue: 40, kind: "usage" },
          { usedDate: "2026-04-08", faceValue: 30, actualValue: 30, kind: "usage" },
          { usedDate: "2026-05-02", faceValue: 50, actualValue: 50, kind: "usage" },
        ],
      }),
    );

    useCardStore.getState().removeCycleRecords("c1", "b1", "2026-04-01", "2026-04-30");

    const records = useCardStore.getState().cards[0].benefits[0].usageRecords;
    expect(records).toHaveLength(2);
    expect(records.map((r) => r.usedDate).sort()).toEqual(["2026-03-01", "2026-05-02"]);
  });
});

describe("multi-record cumulative behavior", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-10T12:00:00"));
    useCardStore.setState({ cards: [], settings: useCardStore.getState().settings });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("two partial records under face keep benefit unused; third crosses threshold → used", () => {
    useCardStore.getState().addCard(makeCard({ id: "c1" }));
    useCardStore.getState().addBenefit("c1", makeBenefit({ id: "b1", faceValue: 200 }));

    useCardStore.getState().addBenefitUsage("c1", "b1", {
      consumedFace: 50,
      actualValue: 50,
      usedDate: "2026-04-02",
    });
    useCardStore.getState().addBenefitUsage("c1", "b1", {
      consumedFace: 75,
      actualValue: 75,
      usedDate: "2026-04-05",
    });

    let benefit = useCardStore.getState().cards[0].benefits[0];
    expect(benefit.usageRecords).toHaveLength(2);
    expect(isBenefitUsedInPeriod(benefit, new Date(), "2024-03-15")).toBe(false);

    useCardStore.getState().addBenefitUsage("c1", "b1", {
      consumedFace: 80,
      actualValue: 80,
      usedDate: "2026-04-07",
    });

    benefit = useCardStore.getState().cards[0].benefits[0];
    expect(benefit.usageRecords).toHaveLength(3);
    // 50 + 75 + 80 = 205 >= 200 → used.
    expect(isBenefitUsedInPeriod(benefit, new Date(), "2024-03-15")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Batch 6: subscription propagateNext materialization on hydrate (importData)
// ---------------------------------------------------------------------------

describe("hydrate materializes subscription propagateNext chains", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-15T12:00:00"));
    useCardStore.setState({ cards: [], settings: useCardStore.getState().settings });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("importData materializes a 2-month propagateNext chain up to today's cycle", () => {
    const benefit: Benefit = {
      id: "b",
      name: "Netflix",
      description: "",
      faceValue: 20,
      category: "streaming",
      resetType: "subscription",
      resetConfig: { period: "monthly" },
      isHidden: false,
      rolloverable: false,
      rolloverMaxYears: 0,
      usageRecords: [
        {
          usedDate: "2026-02-01",
          faceValue: 20,
          actualValue: 13,
          kind: "usage",
          propagateNext: true,
        },
      ],
    };
    const card: CreditCard = {
      id: "c",
      owner: "me",
      cardTypeSlug: "x",
      annualFee: 0,
      cardOpenDate: "2024-01-01",
      color: "#000",
      isEnabled: true,
      benefits: [benefit],
    };
    const json = JSON.stringify({
      version: 1,
      cards: [card],
      settings: useCardStore.getState().settings,
    });

    useCardStore.getState().importData(json);

    const loaded = useCardStore.getState().cards[0].benefits[0];
    const dates = loaded.usageRecords.map((r) => r.usedDate).sort();
    expect(dates).toEqual(["2026-02-01", "2026-03-01", "2026-04-01"]);
    for (const r of loaded.usageRecords) {
      expect(r.actualValue).toBe(13);
      expect(r.propagateNext).toBe(true);
    }
  });

  it("re-hydrating the same data does not duplicate materialized records", () => {
    const benefit: Benefit = {
      id: "b",
      name: "Netflix",
      description: "",
      faceValue: 20,
      category: "streaming",
      resetType: "subscription",
      resetConfig: { period: "monthly" },
      isHidden: false,
      rolloverable: false,
      rolloverMaxYears: 0,
      usageRecords: [
        {
          usedDate: "2026-02-01",
          faceValue: 20,
          actualValue: 13,
          kind: "usage",
          propagateNext: true,
        },
      ],
    };
    const card: CreditCard = {
      id: "c",
      owner: "me",
      cardTypeSlug: "x",
      annualFee: 0,
      cardOpenDate: "2024-01-01",
      color: "#000",
      isEnabled: true,
      benefits: [benefit],
    };
    const json = JSON.stringify({
      version: 1,
      cards: [card],
      settings: useCardStore.getState().settings,
    });

    useCardStore.getState().importData(json);
    const firstPass = useCardStore.getState().cards[0].benefits[0].usageRecords.length;
    expect(firstPass).toBe(3);

    // Export what's now in store, import it again — should be a no-op
    // (materialize is idempotent).
    const secondJson = useCardStore.getState().exportData();
    useCardStore.getState().importData(secondJson);
    const secondPass = useCardStore.getState().cards[0].benefits[0].usageRecords.length;
    expect(secondPass).toBe(3);
  });
});
