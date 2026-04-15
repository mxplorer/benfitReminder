import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Benefit, CreditCard, UsageRecord } from "../models/types";
import { useCardStore } from "./useCardStore";

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

describe("useCardStore", () => {
  beforeEach(() => {
    useCardStore.setState({ cards: [], settings: useCardStore.getState().settings });
  });

  describe("card CRUD", () => {
    it("addCard adds a card to state", () => {
      const card = makeCard();
      useCardStore.getState().addCard(card);
      expect(useCardStore.getState().cards).toHaveLength(1);
      expect(useCardStore.getState().cards[0].id).toBe("card-1");
    });

    it("removeCard removes card by id", () => {
      useCardStore.getState().addCard(makeCard({ id: "c1" }));
      useCardStore.getState().addCard(makeCard({ id: "c2" }));
      useCardStore.getState().removeCard("c1");
      expect(useCardStore.getState().cards).toHaveLength(1);
      expect(useCardStore.getState().cards[0].id).toBe("c2");
    });

    it("updateCard merges partial updates", () => {
      useCardStore.getState().addCard(makeCard());
      useCardStore.getState().updateCard("card-1", { alias: "My Card", annualFee: 100 });
      const card = useCardStore.getState().cards[0];
      expect(card.alias).toBe("My Card");
      expect(card.annualFee).toBe(100);
      expect(card.owner).toBe("Test"); // unchanged
    });

    it("toggleCardEnabled flips isEnabled", () => {
      useCardStore.getState().addCard(makeCard({ isEnabled: true }));
      useCardStore.getState().toggleCardEnabled("card-1");
      expect(useCardStore.getState().cards[0].isEnabled).toBe(false);
      useCardStore.getState().toggleCardEnabled("card-1");
      expect(useCardStore.getState().cards[0].isEnabled).toBe(true);
    });
  });

  describe("benefit CRUD", () => {
    beforeEach(() => {
      useCardStore.getState().addCard(makeCard());
    });

    it("addBenefit adds benefit to card", () => {
      useCardStore.getState().addBenefit("card-1", makeBenefit());
      expect(useCardStore.getState().cards[0].benefits).toHaveLength(1);
    });

    it("removeBenefit removes benefit from card", () => {
      useCardStore.getState().addBenefit("card-1", makeBenefit({ id: "b1" }));
      useCardStore.getState().addBenefit("card-1", makeBenefit({ id: "b2" }));
      useCardStore.getState().removeBenefit("card-1", "b1");
      const benefits = useCardStore.getState().cards[0].benefits;
      expect(benefits).toHaveLength(1);
      expect(benefits[0].id).toBe("b2");
    });

    it("toggleBenefitHidden flips isHidden", () => {
      useCardStore.getState().addBenefit("card-1", makeBenefit({ isHidden: false }));
      useCardStore.getState().toggleBenefitHidden("card-1", "b1");
      expect(useCardStore.getState().cards[0].benefits[0].isHidden).toBe(true);
    });

  });

  describe("toggleBenefitUsage", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-04-10T12:00:00"));
      useCardStore.getState().addCard(makeCard());
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("creates usage record with faceValue snapshot on check-off", () => {
      useCardStore.getState().addBenefit("card-1", makeBenefit({ faceValue: 200 }));
      useCardStore.getState().toggleBenefitUsage("card-1", "b1");

      const records = useCardStore.getState().cards[0].benefits[0].usageRecords;
      expect(records).toHaveLength(1);
      expect(records[0].usedDate).toBe("2026-04-10");
      expect(records[0].faceValue).toBe(200);
      expect(records[0].actualValue).toBe(200);
    });

    it("uses custom actualValue when provided", () => {
      useCardStore.getState().addBenefit("card-1", makeBenefit({ faceValue: 100 }));
      useCardStore.getState().toggleBenefitUsage("card-1", "b1", 80);

      const records = useCardStore.getState().cards[0].benefits[0].usageRecords;
      expect(records[0].actualValue).toBe(80);
      expect(records[0].faceValue).toBe(100); // snapshot unchanged
    });

    it("removes most recent record on re-toggle (undo)", () => {
      useCardStore.getState().addBenefit("card-1", makeBenefit());
      useCardStore.getState().toggleBenefitUsage("card-1", "b1");
      expect(useCardStore.getState().cards[0].benefits[0].usageRecords).toHaveLength(1);

      useCardStore.getState().toggleBenefitUsage("card-1", "b1");
      expect(useCardStore.getState().cards[0].benefits[0].usageRecords).toHaveLength(0);
    });
  });

  describe("getUnusedBenefitCount", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-04-10T12:00:00"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("counts unused, non-hidden benefits on enabled cards (monthly sub with no record now counts when unused)", () => {
      const card = makeCard({
        benefits: [
          makeBenefit({ id: "b1" }), // unused → count
          makeBenefit({ id: "b2", isHidden: true }), // hidden → skip
          makeBenefit({ id: "b3", resetType: "subscription" }), // monthly sub, no record → count
          makeBenefit({
            id: "b4",
            usageRecords: [{ usedDate: "2026-04-05", faceValue: 100, actualValue: 100 }],
          }), // used → skip
        ],
      });
      useCardStore.getState().addCard(card);
      expect(useCardStore.getState().getUnusedBenefitCount()).toBe(2);
    });

    it("excludes disabled cards", () => {
      const card = makeCard({
        isEnabled: false,
        benefits: [makeBenefit()],
      });
      useCardStore.getState().addCard(card);
      expect(useCardStore.getState().getUnusedBenefitCount()).toBe(0);
    });
  });

  describe("settings", () => {
    it("updateSettings merges partial settings", () => {
      useCardStore.getState().updateSettings({ reminderDays: 7 });
      expect(useCardStore.getState().settings.reminderDays).toBe(7);
      expect(useCardStore.getState().settings.reminderEnabled).toBe(true); // unchanged
    });
  });

  describe("loadData", () => {
    it("replaces cards and settings", () => {
      useCardStore.getState().addCard(makeCard({ id: "old" }));
      const newCard = makeCard({ id: "new" });
      const newSettings = {
        logLevel: "debug" as const,
        debugLogEnabled: true,
        reminderEnabled: false,
        reminderDays: 5,
        dismissedDate: null,
      };
      useCardStore.getState().loadData([newCard], newSettings);

      expect(useCardStore.getState().cards).toHaveLength(1);
      expect(useCardStore.getState().cards[0].id).toBe("new");
      expect(useCardStore.getState().settings.logLevel).toBe("debug");
    });
  });

  describe("exportData", () => {
    it("returns valid JSON with version, cards, and settings", () => {
      useCardStore.getState().addCard(makeCard({ id: "c1" }));
      const json = useCardStore.getState().exportData();
      const parsed = JSON.parse(json) as Record<string, unknown>;
      expect(parsed.version).toBe(1);
      expect(Array.isArray(parsed.cards)).toBe(true);
      expect(parsed.settings).toBeDefined();
    });
  });

  describe("importData", () => {
    it("replaces state with valid import data", () => {
      useCardStore.getState().addCard(makeCard({ id: "old" }));
      const importJson = JSON.stringify({
        version: 1,
        cards: [makeCard({ id: "imported" })],
        settings: {
          logLevel: "warn",
          debugLogEnabled: false,
          reminderEnabled: true,
          reminderDays: 5,
          dismissedDate: null,
        },
      });
      useCardStore.getState().importData(importJson);
      expect(useCardStore.getState().cards).toHaveLength(1);
      expect(useCardStore.getState().cards[0].id).toBe("imported");
      expect(useCardStore.getState().settings.logLevel).toBe("warn");
    });

    it("throws on invalid JSON and preserves state", () => {
      useCardStore.getState().addCard(makeCard({ id: "existing" }));
      expect(() => {
        useCardStore.getState().importData("not json");
      }).toThrow("Invalid JSON");
      expect(useCardStore.getState().cards[0].id).toBe("existing");
    });

    it("throws on missing version field", () => {
      expect(() => {
        useCardStore.getState().importData(JSON.stringify({ cards: [] }));
      }).toThrow("version");
    });

    it("throws on missing cards array", () => {
      expect(() => {
        useCardStore.getState().importData(JSON.stringify({ version: 1 }));
      }).toThrow("cards");
    });
  });

  describe("JSON round-trip", () => {
    it("export → import produces deep-equal state", () => {
      const card = makeCard({
        id: "rt-1",
        benefits: [
          makeBenefit({
            id: "b1",
            usageRecords: [{ usedDate: "2026-04-01", faceValue: 100, actualValue: 80 }],
          }),
        ],
      });
      useCardStore.getState().addCard(card);
      const exported = useCardStore.getState().exportData();

      // Reset and reimport
      useCardStore.setState({ cards: [] });
      useCardStore.getState().importData(exported);

      expect(useCardStore.getState().cards).toHaveLength(1);
      expect(useCardStore.getState().cards[0].benefits[0].usageRecords[0]).toEqual({
        usedDate: "2026-04-01",
        faceValue: 100,
        actualValue: 80,
      });
    });
  });

  describe("rolloverBenefit", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-04-10T12:00:00"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("writes a rollover UsageRecord with faceValue 0", () => {
      const card = makeCard({
        id: "c1",
        benefits: [makeBenefit({ id: "b1", rolloverable: true, rolloverMaxYears: 2 })],
      });
      useCardStore.setState({ cards: [card] });

      useCardStore.getState().rolloverBenefit("c1", "b1");

      const records = useCardStore.getState().cards[0].benefits[0].usageRecords;
      expect(records).toHaveLength(1);
      expect(records[0].faceValue).toBe(0);
      expect(records[0].actualValue).toBe(0);
      expect(records[0].isRollover).toBe(true);
    });

    it("does nothing for non-rolloverable benefit", () => {
      const card = makeCard({
        id: "c1",
        benefits: [makeBenefit({ id: "b1", rolloverable: false })],
      });
      useCardStore.setState({ cards: [card] });

      useCardStore.getState().rolloverBenefit("c1", "b1");

      const records = useCardStore.getState().cards[0].benefits[0].usageRecords;
      expect(records).toHaveLength(0);
    });
  });

  describe("backfillBenefitUsage", () => {
    it("appends multiple records at once", () => {
      const card = makeCard({
        id: "c1",
        benefits: [makeBenefit({ id: "b1" })],
      });
      useCardStore.setState({ cards: [card] });

      const records = [
        { usedDate: "2026-01-01", faceValue: 100, actualValue: 80 },
        { usedDate: "2025-10-01", faceValue: 100, actualValue: 100 },
      ];
      useCardStore.getState().backfillBenefitUsage("c1", "b1", records);

      const stored = useCardStore.getState().cards[0].benefits[0].usageRecords;
      expect(stored).toHaveLength(2);
      expect(stored[0].usedDate).toBe("2026-01-01");
      expect(stored[1].usedDate).toBe("2025-10-01");
    });
  });

  describe("setBenefitCycleUsed", () => {
    beforeEach(() => {
      useCardStore.setState({
        cards: [
          {
            id: "c1",
            owner: "me",
            cardTypeSlug: "x",
            annualFee: 100,
            cardOpenDate: "2024-01-01",
            color: "#000",
            isEnabled: true,
            benefits: [
              {
                id: "b1",
                name: "Quarterly",
                description: "",
                faceValue: 100,
                category: "other",
                resetType: "calendar",
                resetConfig: { period: "quarterly" },
                isHidden: false,
                rolloverable: false,
                rolloverMaxYears: 0,
                usageRecords: [
                  { usedDate: "2026-02-05", faceValue: 100, actualValue: 100 }, // Q1
                ],
              },
            ],
          },
        ],
      });
    });

    it("adds a record for unused cycle with cycleStart date when today outside cycle", () => {
      useCardStore
        .getState()
        .setBenefitCycleUsed("c1", "b1", "2026-07-01", "2026-09-30", true, { actualValue: 90 });
      const b = useCardStore.getState().cards[0].benefits[0];
      expect(b.usageRecords).toHaveLength(2);
      const q3 = b.usageRecords.find(
        (r) => r.usedDate >= "2026-07-01" && r.usedDate <= "2026-09-30",
      );
      expect(q3).toEqual({ usedDate: "2026-07-01", faceValue: 100, actualValue: 90 });
    });

    it("uses explicit usedDate when provided", () => {
      useCardStore
        .getState()
        .setBenefitCycleUsed("c1", "b1", "2026-07-01", "2026-09-30", true, {
          actualValue: 90,
          usedDate: "2026-08-15",
        });
      const b = useCardStore.getState().cards[0].benefits[0];
      expect(b.usageRecords.some((r) => r.usedDate === "2026-08-15")).toBe(true);
    });

    it("updates in place when used=true on a record in the same cycle", () => {
      useCardStore
        .getState()
        .setBenefitCycleUsed("c1", "b1", "2026-01-01", "2026-03-31", true, { actualValue: 100 });
      const b = useCardStore.getState().cards[0].benefits[0];
      expect(b.usageRecords).toHaveLength(1);
      expect(b.usageRecords[0].actualValue).toBe(100);
    });

    it("removes the record in the clicked cycle on used=false", () => {
      useCardStore.getState().setBenefitCycleUsed("c1", "b1", "2026-01-01", "2026-03-31", false);
      const b = useCardStore.getState().cards[0].benefits[0];
      expect(b.usageRecords).toHaveLength(0);
    });

    it("removing a non-existent cycle record is a no-op", () => {
      useCardStore.getState().setBenefitCycleUsed("c1", "b1", "2026-07-01", "2026-09-30", false);
      const b = useCardStore.getState().cards[0].benefits[0];
      expect(b.usageRecords).toHaveLength(1);
      expect(b.usageRecords[0].usedDate).toBe("2026-02-05");
    });

    it("removes only the cycle's record, leaving others alone", () => {
      useCardStore.setState({
        cards: [
          {
            ...useCardStore.getState().cards[0],
            benefits: [
              {
                ...useCardStore.getState().cards[0].benefits[0],
                usageRecords: [
                  { usedDate: "2026-02-05", faceValue: 100, actualValue: 100 }, // Q1
                  { usedDate: "2026-05-10", faceValue: 100, actualValue: 80 }, // Q2
                ],
              },
            ],
          },
        ],
      });
      useCardStore.getState().setBenefitCycleUsed("c1", "b1", "2026-01-01", "2026-03-31", false);
      const b = useCardStore.getState().cards[0].benefits[0];
      expect(b.usageRecords).toEqual([
        { usedDate: "2026-05-10", faceValue: 100, actualValue: 80 },
      ]);
    });

    it("defaults usedDate to today when today falls inside cycle", () => {
      useCardStore.setState({
        cards: [
          {
            ...useCardStore.getState().cards[0],
            benefits: [
              {
                ...useCardStore.getState().cards[0].benefits[0],
                usageRecords: [],
              },
            ],
          },
        ],
      });
      const today = new Date();
      const y = today.getFullYear();
      const m = today.getMonth() + 1;
      const cycleStart = `${String(y)}-${String(m).padStart(2, "0")}-01`;
      const daysInMonth = new Date(y, m, 0).getDate();
      const cycleEnd = `${String(y)}-${String(m).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
      useCardStore
        .getState()
        .setBenefitCycleUsed("c1", "b1", cycleStart, cycleEnd, true, { actualValue: 10 });
      const b = useCardStore.getState().cards[0].benefits[0];
      const iso = `${String(y)}-${String(m).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      expect(b.usageRecords[0].usedDate).toBe(iso);
    });
  });

});

describe("generateAutoRecurRecords — per-record propagation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-15T10:00:00"));
    // IMPORTANT: reset the store, including `now`, so tests see the faked time.
    useCardStore.setState({ cards: [], now: new Date("2026-04-15T10:00:00") });
  });
  afterEach(() => { vi.useRealTimers(); });

  const makeMonthlySub = (records: UsageRecord[]): Benefit => ({
    id: "b1", name: "$25/mo", description: "", faceValue: 25,
    category: "streaming", resetType: "subscription", resetConfig: {},
    isHidden: false, rolloverable: false, rolloverMaxYears: 0,
    usageRecords: records,
  });

  const seed = (benefit: Benefit) => {
    useCardStore.setState({
      cards: [{
        id: "c1", owner: "me", cardTypeSlug: "amex_platinum",
        annualFee: 695, cardOpenDate: "2024-01-01", color: "#000",
        isEnabled: true, benefits: [benefit],
      }],
      now: new Date("2026-04-15T10:00:00"),
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

  it("skips non-monthly benefits", () => {
    const benefit: Benefit = {
      id: "b1", name: "quarterly", description: "", faceValue: 100,
      category: "dining", resetType: "calendar", resetConfig: { period: "quarterly" },
      isHidden: false, rolloverable: false, rolloverMaxYears: 0,
      usageRecords: [{ usedDate: "2026-03-10", faceValue: 100, actualValue: 100, propagateNext: true }],
    };
    seed(benefit);
    useCardStore.getState().generateAutoRecurRecords();
    expect(useCardStore.getState().cards[0].benefits[0].usageRecords).toHaveLength(1);
  });
});

describe("recalculate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-15T10:00:00"));
  });
  afterEach(() => { vi.useRealTimers(); });

  it("bumps store.now and runs generation", () => {
    useCardStore.setState({ now: new Date("2026-04-15T10:00:00") });
    const before = useCardStore.getState().now;
    vi.setSystemTime(new Date("2026-04-15T10:05:00"));
    useCardStore.getState().recalculate();
    const after = useCardStore.getState().now;
    expect(after.getTime()).toBeGreaterThan(before.getTime());
  });
});

describe("getUnusedBenefitCount — monthly subscriptions countable", () => {
  beforeEach(() => {
    useCardStore.setState({ cards: [] });
  });

  it("counts monthly subscription as unused when current month has no record", () => {
    const benefit: Benefit = {
      id: "b", name: "Netflix", description: "", faceValue: 20,
      category: "streaming", resetType: "subscription",
      resetConfig: { period: "monthly" },
      isHidden: false, rolloverable: false, rolloverMaxYears: 0,
      usageRecords: [],
    };
    const card: CreditCard = {
      id: "c", owner: "me", cardTypeSlug: "x", annualFee: 0,
      cardOpenDate: "2024-01-01", color: "#000", isEnabled: true, benefits: [benefit],
    };
    useCardStore.setState({ cards: [card] });

    expect(useCardStore.getState().getUnusedBenefitCount()).toBe(1);
  });
});

describe("setBenefitCycleUsed with propagateNext", () => {
  beforeEach(() => {
    useCardStore.setState({
      cards: [{
        id: "c1", owner: "me", cardTypeSlug: "amex_platinum",
        annualFee: 695, cardOpenDate: "2024-01-01", color: "#000",
        isEnabled: true,
        benefits: [{
          id: "b1", name: "$25/mo", description: "", faceValue: 25,
          category: "streaming", resetType: "subscription", resetConfig: {},
          isHidden: false, rolloverable: false,
          rolloverMaxYears: 0, usageRecords: [],
        }],
      }],
    });
  });

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

  it("removes the record when used=false", () => {
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
  });
});
