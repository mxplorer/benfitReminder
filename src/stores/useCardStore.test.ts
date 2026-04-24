import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Benefit, CreditCard, UsageRecord } from "../models/types";
import { useCardStore } from "./useCardStore";
import { useCardTypeStore } from "./useCardTypeStore";

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
    useCardTypeStore.getState().reset();
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

    it("clamps out-of-period usedDate to today so the record counts as used now", () => {
      // Calendar-annual benefit. Today is 2026-04-10 (faked). User enters
      // usedDate=2025-04-16 (prior year's cycle). Without clamping, the record
      // would be orphaned — isBenefitUsedInPeriod checks the current calendar
      // year and wouldn't find the record, so the benefit would still show as
      // "available" despite being marked used.
      useCardStore.getState().addBenefit("card-1", makeBenefit({
        resetType: "calendar",
        resetConfig: { period: "annual" },
      }));
      useCardStore.getState().toggleBenefitUsage("card-1", "b1", 50, "2025-04-16");

      const records = useCardStore.getState().cards[0].benefits[0].usageRecords;
      expect(records).toHaveLength(1);
      expect(records[0].usedDate).toBe("2026-04-10");
      expect(records[0].actualValue).toBe(50);
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
            usageRecords: [{ usedDate: "2026-04-05", faceValue: 100, actualValue: 100, kind: "usage" }],
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
        trayOpacity: 100,
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

    it("runs template sync on imported cards (legacy → newer template)", async () => {
      const { useCardTypeStore } = await import("./useCardTypeStore");
      const originalCardTypes = useCardTypeStore.getState().cardTypes;
      try {
        useCardTypeStore.getState().setBuiltinCardTypes([
          {
            slug: "test_card",
            name: "Test Card",
            issuer: "Amex",
            defaultAnnualFee: 0,
            color: "#000",
            isBuiltin: true,
            version: 2,
            defaultBenefits: [
              {
                templateBenefitId: "tc.benefit_a",
                name: "Updated Name",
                description: "Updated",
                faceValue: 999,
                category: "travel",
                resetType: "calendar",
                resetConfig: { period: "annual" },
              },
            ],
          },
        ]);

        const importJson = JSON.stringify({
          version: 1,
          cards: [
            {
              id: "c1",
              owner: "test",
              cardTypeSlug: "test_card",
              annualFee: 0,
              cardOpenDate: "2025-01-01",
              color: "#000",
              isEnabled: true,
              templateVersion: 1,
              benefits: [
                {
                  id: "b1",
                  templateBenefitId: "tc.benefit_a",
                  name: "Old Name",
                  description: "Old",
                  faceValue: 100,
                  category: "travel",
                  resetType: "calendar",
                  resetConfig: { period: "annual" },
                  isHidden: false,
                  rolloverable: false,
                  rolloverMaxYears: 2,
                  usageRecords: [],
                },
              ],
            },
          ],
        });

        useCardStore.getState().importData(importJson);
        const card = useCardStore.getState().cards[0];
        expect(card.templateVersion).toBe(2);
        expect(card.benefits[0].name).toBe("Updated Name");
        expect(card.benefits[0].faceValue).toBe(999);
      } finally {
        // Restore the card type store so other tests aren't polluted.
        // The store uses a single `cardTypes` array internally, so we set it
        // back directly to whatever it was at entry.
        useCardTypeStore.setState({ cardTypes: originalCardTypes });
      }
    });

    it("preserves card benefits when no matching template is registered", () => {
      const importJson = JSON.stringify({
        version: 1,
        cards: [
          {
            id: "c1",
            owner: "test",
            cardTypeSlug: "no_such_template",
            annualFee: 0,
            cardOpenDate: "2025-01-01",
            color: "#000",
            isEnabled: true,
            templateVersion: 1,
            benefits: [
              {
                id: "b1",
                templateBenefitId: "x.y",
                name: "Some Benefit",
                description: "Desc",
                faceValue: 100,
                category: "travel",
                resetType: "calendar",
                resetConfig: { period: "annual" },
                isHidden: false,
                rolloverable: false,
                rolloverMaxYears: 2,
                usageRecords: [],
              },
            ],
          },
        ],
      });

      // Note: useCardTypeStore is empty due to beforeEach reset.
      useCardStore.getState().importData(importJson);
      const card = useCardStore.getState().cards[0];
      expect(card.benefits).toHaveLength(1);
      expect(card.benefits[0].name).toBe("Some Benefit");
      expect(card.templateVersion).toBe(1); // unchanged — no template to sync against
    });
  });

  describe("JSON round-trip", () => {
    it("export → import produces deep-equal state", () => {
      const card = makeCard({
        id: "rt-1",
        benefits: [
          makeBenefit({
            id: "b1",
            usageRecords: [{ usedDate: "2026-04-01", faceValue: 100, actualValue: 80, kind: "usage" }],
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
        kind: "usage",
      });
    });
  });

  describe("replaceRolloverRecords", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-04-10T12:00:00"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    const rolloverAnnual = (overrides: Partial<Benefit> = {}): Benefit =>
      makeBenefit({
        id: "b1",
        faceValue: 100,
        resetType: "calendar",
        resetConfig: { period: "annual" },
        rolloverable: true,
        rolloverMaxYears: 3,
        ...overrides,
      });

    it("writes N past-cycle rollover records + a current-cycle marker on save", () => {
      const card = makeCard({ id: "c1", benefits: [rolloverAnnual()] });
      useCardStore.setState({ cards: [card] });

      useCardStore.getState().replaceRolloverRecords("c1", "b1", 200);

      const records = useCardStore.getState().cards[0].benefits[0].usageRecords;
      expect(records.every((r) => r.kind === "rollover")).toBe(true);
      expect(records.map((r) => r.usedDate).sort()).toEqual([
        "2024-01-01",
        "2025-01-01",
        "2026-01-01",
      ]);
    });

    it("marks the current cycle as used (isBenefitUsedInPeriod) after save", () => {
      const card = makeCard({ id: "c1", benefits: [rolloverAnnual()] });
      useCardStore.setState({ cards: [card] });

      useCardStore.getState().replaceRolloverRecords("c1", "b1", 0);

      // Even with amount=0, saving decides the current cycle: rollover marker
      // at current cycle start makes isBenefitUsedInPeriod return true.
      const benefit = useCardStore.getState().cards[0].benefits[0];
      const currentMarker = benefit.usageRecords.find((r) => r.usedDate === "2026-01-01");
      expect(currentMarker).toBeDefined();
      expect(currentMarker?.kind).toBe("rollover");
    });

    it("is idempotent on identical amount", () => {
      const card = makeCard({ id: "c1", benefits: [rolloverAnnual()] });
      useCardStore.setState({ cards: [card] });

      useCardStore.getState().replaceRolloverRecords("c1", "b1", 200);
      const first = useCardStore.getState().cards[0].benefits[0].usageRecords;
      useCardStore.getState().replaceRolloverRecords("c1", "b1", 200);
      const second = useCardStore.getState().cards[0].benefits[0].usageRecords;

      expect(second.map((r) => r.usedDate).sort()).toEqual(first.map((r) => r.usedDate).sort());
    });

    it("clamps past-cycle rollovers to rolloverMaxYears * period multiplier", () => {
      const card = makeCard({
        id: "c1",
        benefits: [rolloverAnnual({ rolloverMaxYears: 2 })],
      });
      useCardStore.setState({ cards: [card] });

      // faceValue 100 + maxYears 2 caps past-cycle rollovers at 2; 500 would want 5.
      useCardStore.getState().replaceRolloverRecords("c1", "b1", 500);

      const records = useCardStore.getState().cards[0].benefits[0].usageRecords;
      const pastRollovers = records.filter(
        (r) => r.kind === "rollover" && r.usedDate < "2026-01-01",
      );
      expect(pastRollovers).toHaveLength(2);
    });

    it("reducing amount prunes oldest past-cycle records", () => {
      const card = makeCard({ id: "c1", benefits: [rolloverAnnual()] });
      useCardStore.setState({ cards: [card] });

      useCardStore.getState().replaceRolloverRecords("c1", "b1", 300);
      // 3 past rollovers + 1 current-cycle marker
      expect(useCardStore.getState().cards[0].benefits[0].usageRecords).toHaveLength(4);

      useCardStore.getState().replaceRolloverRecords("c1", "b1", 100);
      const records = useCardStore.getState().cards[0].benefits[0].usageRecords;
      // 1 past rollover + 1 current-cycle marker
      expect(records).toHaveLength(2);
      const pastRollover = records.find((r) => r.usedDate < "2026-01-01");
      expect(pastRollover?.usedDate).toBe("2025-01-01");
    });

    it("reducing rolloverMaxYears silently prunes over-cap records on next replace", () => {
      const card = makeCard({
        id: "c1",
        benefits: [rolloverAnnual({ rolloverMaxYears: 3 })],
      });
      useCardStore.setState({ cards: [card] });
      useCardStore.getState().replaceRolloverRecords("c1", "b1", 300);

      useCardStore.setState({
        cards: useCardStore.getState().cards.map((c) =>
          c.id === "c1"
            ? {
                ...c,
                benefits: c.benefits.map((b) =>
                  b.id === "b1" ? { ...b, rolloverMaxYears: 1 } : b,
                ),
              }
            : c,
        ),
      });

      useCardStore.getState().replaceRolloverRecords("c1", "b1", 300);
      const records = useCardStore.getState().cards[0].benefits[0].usageRecords;
      const pastRollovers = records.filter(
        (r) => r.kind === "rollover" && r.usedDate < "2026-01-01",
      );
      expect(pastRollovers).toHaveLength(1);
      expect(pastRollovers[0].usedDate).toBe("2025-01-01");
    });

    it("replaces a pre-existing current-cycle rollover marker with a fresh one", () => {
      const card = makeCard({
        id: "c1",
        benefits: [
          rolloverAnnual({
            usageRecords: [
              { usedDate: "2026-01-01", faceValue: 0, actualValue: 0, kind: "rollover" },
            ],
          }),
        ],
      });
      useCardStore.setState({ cards: [card] });

      useCardStore.getState().replaceRolloverRecords("c1", "b1", 200);

      const records = useCardStore.getState().cards[0].benefits[0].usageRecords;
      expect(records.every((r) => r.kind === "rollover")).toBe(true);
      expect(records.map((r) => r.usedDate).sort()).toEqual([
        "2024-01-01",
        "2025-01-01",
        "2026-01-01",
      ]);
    });

    it("skips the current-cycle marker when a usage record already exists in the current cycle", () => {
      const card = makeCard({
        id: "c1",
        benefits: [
          rolloverAnnual({
            usageRecords: [
              { usedDate: "2026-03-15", faceValue: 100, actualValue: 100, kind: "usage" },
            ],
          }),
        ],
      });
      useCardStore.setState({ cards: [card] });

      useCardStore.getState().replaceRolloverRecords("c1", "b1", 100);

      const records = useCardStore.getState().cards[0].benefits[0].usageRecords;
      expect(records.filter((r) => r.kind === "usage")).toHaveLength(1);
      // Only a past-cycle rollover is written; no current-cycle marker because
      // the user already consumed the cycle.
      expect(records.filter((r) => r.kind === "rollover")).toHaveLength(1);
      expect(records.find((r) => r.kind === "rollover")?.usedDate).toBe("2025-01-01");
    });

    it("preserves non-rollover usage records", () => {
      const card = makeCard({
        id: "c1",
        benefits: [
          rolloverAnnual({
            usageRecords: [
              { usedDate: "2025-06-15", faceValue: 100, actualValue: 100, kind: "usage" },
            ],
          }),
        ],
      });
      useCardStore.setState({ cards: [card] });

      useCardStore.getState().replaceRolloverRecords("c1", "b1", 100);

      const records = useCardStore.getState().cards[0].benefits[0].usageRecords;
      // 1 past usage (preserved) + 1 past-cycle rollover + 1 current-cycle marker
      expect(records.filter((r) => r.kind === "usage")).toHaveLength(1);
      expect(records.filter((r) => r.kind === "rollover")).toHaveLength(2);
    });

    it("does nothing for non-rolloverable benefit", () => {
      const card = makeCard({
        id: "c1",
        benefits: [makeBenefit({ id: "b1", rolloverable: false })],
      });
      useCardStore.setState({ cards: [card] });

      useCardStore.getState().replaceRolloverRecords("c1", "b1", 200);

      const records = useCardStore.getState().cards[0].benefits[0].usageRecords;
      expect(records).toHaveLength(0);
    });

    it("does nothing for non-calendar benefit (no period)", () => {
      const card = makeCard({
        id: "c1",
        benefits: [
          makeBenefit({
            id: "b1",
            rolloverable: true,
            rolloverMaxYears: 2,
            resetType: "since_last_use",
            resetConfig: { cooldownDays: 90 },
          }),
        ],
      });
      useCardStore.setState({ cards: [card] });

      useCardStore.getState().replaceRolloverRecords("c1", "b1", 200);

      const records = useCardStore.getState().cards[0].benefits[0].usageRecords;
      expect(records).toHaveLength(0);
    });
  });

  describe("clearRolloverRecords", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-04-10T12:00:00"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("drops past-cycle rollover records", () => {
      const card = makeCard({
        id: "c1",
        benefits: [
          makeBenefit({
            id: "b1",
            rolloverable: true,
            rolloverMaxYears: 3,
            resetType: "calendar",
            resetConfig: { period: "annual" },
          }),
        ],
      });
      useCardStore.setState({ cards: [card] });
      useCardStore.getState().replaceRolloverRecords("c1", "b1", 200);

      useCardStore.getState().clearRolloverRecords("c1", "b1");

      const records = useCardStore.getState().cards[0].benefits[0].usageRecords;
      expect(records.filter((r) => r.kind === "rollover")).toHaveLength(0);
    });

    it("leaves non-rollover records intact", () => {
      const card = makeCard({
        id: "c1",
        benefits: [
          makeBenefit({
            id: "b1",
            rolloverable: true,
            rolloverMaxYears: 2,
            resetType: "calendar",
            resetConfig: { period: "annual" },
            usageRecords: [
              { usedDate: "2025-06-15", faceValue: 100, actualValue: 100, kind: "usage" },
              { usedDate: "2025-01-01", faceValue: 0, actualValue: 0, kind: "rollover" },
            ],
          }),
        ],
      });
      useCardStore.setState({ cards: [card] });

      useCardStore.getState().clearRolloverRecords("c1", "b1");

      const records = useCardStore.getState().cards[0].benefits[0].usageRecords;
      expect(records).toHaveLength(1);
      expect(records[0].kind).toBe("usage");
    });

    it("drops every rollover record, including the current-cycle marker", () => {
      const card = makeCard({
        id: "c1",
        benefits: [
          makeBenefit({
            id: "b1",
            rolloverable: true,
            rolloverMaxYears: 3,
            resetType: "calendar",
            resetConfig: { period: "annual" },
          }),
        ],
      });
      useCardStore.setState({ cards: [card] });
      useCardStore.getState().replaceRolloverRecords("c1", "b1", 200);

      useCardStore.getState().clearRolloverRecords("c1", "b1");

      const records = useCardStore.getState().cards[0].benefits[0].usageRecords;
      expect(records.filter((r) => r.kind === "rollover")).toHaveLength(0);
    });
  });

  describe("toggleCurrentCycleRollover", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-04-10T12:00:00"));
      useCardStore.setState({ now: new Date("2026-04-10T12:00:00") });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    const rolloverAnnual = (overrides: Partial<Benefit> = {}): Benefit =>
      makeBenefit({
        id: "b1",
        faceValue: 100,
        resetType: "calendar",
        resetConfig: { period: "annual" },
        rolloverable: true,
        rolloverMaxYears: 2,
        ...overrides,
      });

    it("creates one rollover record in the current cycle with faceValue = current available", () => {
      const card = makeCard({ id: "c1", benefits: [rolloverAnnual()] });
      useCardStore.setState({ cards: [card] });

      useCardStore.getState().toggleCurrentCycleRollover("c1", "b1");

      const records = useCardStore.getState().cards[0].benefits[0].usageRecords;
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({
        usedDate: "2026-01-01",
        faceValue: 100,
        kind: "rollover",
      });
    });

    it("subtracts current-cycle consumption when computing rolled amount", () => {
      // $30 consumed → only $70 is rolled forward.
      const card = makeCard({
        id: "c1",
        benefits: [
          rolloverAnnual({
            usageRecords: [
              { usedDate: "2026-02-15", faceValue: 30, actualValue: 30, kind: "usage" },
            ],
          }),
        ],
      });
      useCardStore.setState({ cards: [card] });

      useCardStore.getState().toggleCurrentCycleRollover("c1", "b1");

      const records = useCardStore.getState().cards[0].benefits[0].usageRecords;
      const rollover = records.find((r) => r.kind === "rollover");
      expect(rollover?.faceValue).toBe(70);
    });

    it("toggling a second time deletes the rollover record", () => {
      const card = makeCard({ id: "c1", benefits: [rolloverAnnual()] });
      useCardStore.setState({ cards: [card] });

      useCardStore.getState().toggleCurrentCycleRollover("c1", "b1");
      useCardStore.getState().toggleCurrentCycleRollover("c1", "b1");

      const records = useCardStore.getState().cards[0].benefits[0].usageRecords;
      expect(records.filter((r) => r.kind === "rollover")).toHaveLength(0);
    });

    it("no-op when available is 0 and no existing rollover", () => {
      const card = makeCard({
        id: "c1",
        benefits: [
          rolloverAnnual({
            usageRecords: [
              { usedDate: "2026-03-01", faceValue: 100, actualValue: 100, kind: "usage" },
            ],
          }),
        ],
      });
      useCardStore.setState({ cards: [card] });

      useCardStore.getState().toggleCurrentCycleRollover("c1", "b1");

      const records = useCardStore.getState().cards[0].benefits[0].usageRecords;
      expect(records.filter((r) => r.kind === "rollover")).toHaveLength(0);
    });

    it("no-op for non-rolloverable benefit", () => {
      const card = makeCard({
        id: "c1",
        benefits: [makeBenefit({ id: "b1", rolloverable: false })],
      });
      useCardStore.setState({ cards: [card] });

      useCardStore.getState().toggleCurrentCycleRollover("c1", "b1");

      const records = useCardStore.getState().cards[0].benefits[0].usageRecords;
      expect(records).toHaveLength(0);
    });

    it("adds inbound from prev cycle's rollover when computing available", () => {
      // Prev cycle rolled $50 forward. Current has $30 consumed.
      // Total available = 100 + 50 - 30 = 120. Rolling forward should write $120.
      const card = makeCard({
        id: "c1",
        benefits: [
          rolloverAnnual({
            usageRecords: [
              { usedDate: "2025-01-01", faceValue: 50, actualValue: 0, kind: "rollover" },
              { usedDate: "2026-02-15", faceValue: 30, actualValue: 30, kind: "usage" },
            ],
          }),
        ],
      });
      useCardStore.setState({ cards: [card] });

      useCardStore.getState().toggleCurrentCycleRollover("c1", "b1");

      const records = useCardStore.getState().cards[0].benefits[0].usageRecords;
      const currentRollover = records.find(
        (r) => r.kind === "rollover" && r.usedDate === "2026-01-01",
      );
      expect(currentRollover?.faceValue).toBe(120);
    });
  });

  describe("backfillBenefitUsage", () => {
    it("appends multiple records at once", () => {
      const card = makeCard({
        id: "c1",
        benefits: [makeBenefit({ id: "b1" })],
      });
      useCardStore.setState({ cards: [card] });

      const records: UsageRecord[] = [
        { usedDate: "2026-01-01", faceValue: 100, actualValue: 80, kind: "usage" },
        { usedDate: "2025-10-01", faceValue: 100, actualValue: 100, kind: "usage" },
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
                  { usedDate: "2026-02-05", faceValue: 100, actualValue: 100, kind: "usage" }, // Q1
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
      expect(q3).toEqual({ usedDate: "2026-07-01", faceValue: 100, actualValue: 90, kind: "usage" });
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

    it("clamps out-of-cycle usedDate so the record stays associated with the clicked cycle", () => {
      // User clicked Q3 cycle [2026-07-01, 2026-09-30] but entered a date from
      // a prior cycle (2026-04-16). Without clamping the record would be
      // orphaned — findCycleRecord wouldn't see it for Q3.
      useCardStore
        .getState()
        .setBenefitCycleUsed("c1", "b1", "2026-07-01", "2026-09-30", true, {
          actualValue: 90,
          usedDate: "2026-04-16",
        });
      const b = useCardStore.getState().cards[0].benefits[0];
      const q3 = b.usageRecords.find(
        (r) => r.usedDate >= "2026-07-01" && r.usedDate <= "2026-09-30",
      );
      expect(q3).toBeDefined();
      expect(q3?.actualValue).toBe(90);
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
                  { usedDate: "2026-02-05", faceValue: 100, actualValue: 100, kind: "usage" }, // Q1
                  { usedDate: "2026-05-10", faceValue: 100, actualValue: 80, kind: "usage" }, // Q2
                ],
              },
            ],
          },
        ],
      });
      useCardStore.getState().setBenefitCycleUsed("c1", "b1", "2026-01-01", "2026-03-31", false);
      const b = useCardStore.getState().cards[0].benefits[0];
      expect(b.usageRecords).toEqual([
        { usedDate: "2026-05-10", faceValue: 100, actualValue: 80, kind: "usage" },
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
      { usedDate: "2026-03-10", faceValue: 25, actualValue: 22, propagateNext: true, kind: "usage" },
    ]));
    useCardStore.getState().generateAutoRecurRecords();
    const records = useCardStore.getState().cards[0].benefits[0].usageRecords;
    expect(records).toHaveLength(2);
    expect(records[1]).toMatchObject({
      usedDate: "2026-04-01",
      faceValue: 25,
      actualValue: 22,
      propagateNext: true,
      kind: "usage",
    });
  });

  it("does NOT create when prev month's propagateNext is false/absent", () => {
    seed(makeMonthlySub([
      { usedDate: "2026-03-10", faceValue: 25, actualValue: 22, kind: "usage" },
    ]));
    useCardStore.getState().generateAutoRecurRecords();
    expect(useCardStore.getState().cards[0].benefits[0].usageRecords).toHaveLength(1);
  });

  it("does NOT create when current month already has a record", () => {
    seed(makeMonthlySub([
      { usedDate: "2026-03-10", faceValue: 25, actualValue: 22, propagateNext: true, kind: "usage" },
      { usedDate: "2026-04-02", faceValue: 25, actualValue: 25, kind: "usage" },
    ]));
    useCardStore.getState().generateAutoRecurRecords();
    expect(useCardStore.getState().cards[0].benefits[0].usageRecords).toHaveLength(2);
  });

  it("does NOT create when prev month is missing (two-month gap)", () => {
    seed(makeMonthlySub([
      { usedDate: "2026-02-10", faceValue: 25, actualValue: 22, propagateNext: true, kind: "usage" },
    ]));
    useCardStore.getState().generateAutoRecurRecords();
    expect(useCardStore.getState().cards[0].benefits[0].usageRecords).toHaveLength(1);
  });

  it("is idempotent", () => {
    seed(makeMonthlySub([
      { usedDate: "2026-03-10", faceValue: 25, actualValue: 22, propagateNext: true, kind: "usage" },
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
      usageRecords: [{ usedDate: "2026-03-10", faceValue: 100, actualValue: 100, propagateNext: true, kind: "usage" }],
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
          usageRecords: [{ usedDate: "2026-04-05", faceValue: 25, actualValue: 25, propagateNext: true, kind: "usage" }],
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
          usageRecords: [{ usedDate: "2026-04-05", faceValue: 25, actualValue: 25, propagateNext: true, kind: "usage" }],
        })),
      })),
    }));
    useCardStore.getState().setBenefitCycleUsed(
      "c1", "b1", "2026-04-01", "2026-04-30", false,
    );
    expect(useCardStore.getState().cards[0].benefits[0].usageRecords).toHaveLength(0);
  });
});
