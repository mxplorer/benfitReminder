import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Benefit, CreditCard } from "../models/types";
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

    it("toggleBenefitAutoRecur flips autoRecur", () => {
      useCardStore.getState().addBenefit("card-1", makeBenefit({ autoRecur: false }));
      useCardStore.getState().toggleBenefitAutoRecur("card-1", "b1");
      expect(useCardStore.getState().cards[0].benefits[0].autoRecur).toBe(true);
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

    it("counts unused, non-hidden, non-autoRecur benefits on enabled cards", () => {
      const card = makeCard({
        benefits: [
          makeBenefit({ id: "b1" }), // unused → count
          makeBenefit({ id: "b2", isHidden: true }), // hidden → skip
          makeBenefit({ id: "b3", resetType: "subscription", autoRecur: true }), // autoRecur → skip
          makeBenefit({
            id: "b4",
            usageRecords: [{ usedDate: "2026-04-05", faceValue: 100, actualValue: 100 }],
          }), // used → skip
        ],
      });
      useCardStore.getState().addCard(card);
      expect(useCardStore.getState().getUnusedBenefitCount()).toBe(1);
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

  describe("generateAutoRecurRecords", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-04-10T12:00:00"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("creates records for subscription autoRecur benefits without current month record", () => {
      const card = makeCard({
        benefits: [
          makeBenefit({
            id: "sub1",
            resetType: "subscription",
            autoRecur: true,
            faceValue: 25,
            usageRecords: [],
          }),
          makeBenefit({
            id: "sub2",
            resetType: "subscription",
            autoRecur: false,
            usageRecords: [],
          }),
          makeBenefit({ id: "reg", resetType: "calendar", usageRecords: [] }),
        ],
      });
      useCardStore.getState().addCard(card);
      useCardStore.getState().generateAutoRecurRecords();

      const benefits = useCardStore.getState().cards[0].benefits;
      // sub1 (autoRecur=true) should have a record
      expect(benefits[0].usageRecords).toHaveLength(1);
      expect(benefits[0].usageRecords[0].usedDate).toBe("2026-04-01");
      expect(benefits[0].usageRecords[0].faceValue).toBe(25);
      // sub2 (autoRecur=false) and reg (calendar) should not
      expect(benefits[1].usageRecords).toHaveLength(0);
      expect(benefits[2].usageRecords).toHaveLength(0);
    });

    it("does not duplicate if record already exists for current month", () => {
      const card = makeCard({
        benefits: [
          makeBenefit({
            id: "sub1",
            resetType: "subscription",
            autoRecur: true,
            faceValue: 25,
            usageRecords: [{ usedDate: "2026-04-01", faceValue: 25, actualValue: 25 }],
          }),
        ],
      });
      useCardStore.getState().addCard(card);
      useCardStore.getState().generateAutoRecurRecords();

      expect(useCardStore.getState().cards[0].benefits[0].usageRecords).toHaveLength(1);
    });
  });
});
