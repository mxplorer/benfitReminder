import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CreditCard, CardType } from "../models/types";
import type { LogEntry, LogTransport } from "../lib/logger";
import { setGlobalTransports, setGlobalMinLevel } from "../lib/logger";
import { syncCardWithTemplate, syncAllCardsWithTemplates } from "./templateSync";

const createMockTransport = (): LogTransport & { entries: LogEntry[] } => {
  const entries: LogEntry[] = [];
  return {
    entries,
    write: vi.fn((entry: LogEntry) => entries.push(entry)),
  };
};

const makeTemplate = (overrides?: Partial<CardType>): CardType => ({
  slug: "test_card",
  name: "Test Card",
  issuer: "Amex",
  defaultAnnualFee: 100,
  color: "#000",
  isBuiltin: true,
  version: 1,
  defaultBenefits: [
    {
      templateBenefitId: "benefit_a",
      name: "Benefit A",
      description: "Desc A",
      faceValue: 100,
      category: "travel",
      resetType: "calendar",
      resetConfig: { period: "annual" },
    },
  ],
  ...overrides,
});

const makeCard = (overrides?: Partial<CreditCard>): CreditCard => ({
  id: "card-1",
  owner: "user",
  cardTypeSlug: "test_card",
  annualFee: 100,
  cardOpenDate: "2025-06-15",
  color: "#000",
  isEnabled: true,
  benefits: [
    {
      id: "b-1",
      templateBenefitId: "benefit_a",
      name: "Benefit A",
      description: "Desc A",
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
  templateVersion: 1,
  ...overrides,
});

describe("syncCardWithTemplate", () => {
  beforeEach(() => {
    setGlobalTransports([]);
    setGlobalMinLevel("debug");
  });

  it("skips sync when card templateVersion matches template version (fast path)", () => {
    const card = makeCard({ templateVersion: 1 });
    const template = makeTemplate({ version: 1 });
    const result = syncCardWithTemplate(card, template, "2026-04-16");
    expect(result.card).toBe(card); // same reference, no copy
    expect(result.changes).toHaveLength(0);
  });

  it("adds benefits present in template but missing from card", () => {
    const template = makeTemplate({
      version: 2,
      defaultBenefits: [
        {
          templateBenefitId: "benefit_a",
          name: "Benefit A",
          description: "Desc A",
          faceValue: 100,
          category: "travel",
          resetType: "calendar",
          resetConfig: { period: "annual" },
        },
        {
          templateBenefitId: "benefit_b",
          name: "Benefit B",
          description: "Desc B",
          faceValue: 200,
          category: "dining",
          resetType: "calendar",
          resetConfig: { period: "monthly" },
        },
      ],
    });
    const card = makeCard({ templateVersion: 1 });

    const result = syncCardWithTemplate(card, template, "2026-04-16");

    expect(result.card.benefits).toHaveLength(2);
    expect(result.card.templateVersion).toBe(2);

    const added = result.card.benefits.find((b) => b.templateBenefitId === "benefit_b");
    if (!added) throw new Error("expected benefit_b to be added");
    expect(added.name).toBe("Benefit B");
    expect(added.faceValue).toBe(200);
    expect(added.usageRecords).toEqual([]);
    expect(added.isHidden).toBe(false);
    expect(added.id).toBeTruthy(); // has a generated id

    expect(result.changes).toEqual([
      { type: "added", templateBenefitId: "benefit_b", benefitName: "Benefit B" },
    ]);
  });

  it("updates template fields on existing benefits, preserving user fields", () => {
    const template = makeTemplate({
      version: 2,
      defaultBenefits: [
        {
          templateBenefitId: "benefit_a",
          name: "Benefit A Renamed",
          description: "New desc",
          faceValue: 250,
          category: "hotel",
          resetType: "anniversary",
          resetConfig: { period: "annual" },
          rolloverable: true,
          rolloverMaxYears: 3,
        },
      ],
    });
    const card = makeCard({
      templateVersion: 1,
      benefits: [
        {
          id: "b-1",
          templateBenefitId: "benefit_a",
          name: "Benefit A",
          description: "Desc A",
          faceValue: 100,
          category: "travel",
          resetType: "calendar",
          resetConfig: { period: "annual" },
          isHidden: true,
          rolloverable: false,
          rolloverMaxYears: 2,
          usageRecords: [{ usedDate: "2026-01-15", faceValue: 100, actualValue: 80, kind: "usage" }],
        },
      ],
    });

    const result = syncCardWithTemplate(card, template, "2026-04-16");
    const updated = result.card.benefits[0];

    // Template fields overwritten
    expect(updated.name).toBe("Benefit A Renamed");
    expect(updated.description).toBe("New desc");
    expect(updated.faceValue).toBe(250);
    expect(updated.category).toBe("hotel");
    expect(updated.resetType).toBe("anniversary");
    expect(updated.rolloverable).toBe(true);
    expect(updated.rolloverMaxYears).toBe(3);

    // User fields preserved
    expect(updated.id).toBe("b-1");
    expect(updated.isHidden).toBe(true);
    expect(updated.usageRecords).toHaveLength(1);
    expect(updated.usageRecords[0].actualValue).toBe(80);

    expect(result.changes).toEqual([
      { type: "modified", templateBenefitId: "benefit_a", benefitName: "Benefit A Renamed" },
    ]);
  });

  it("marks benefits as expired when removed from template", () => {
    const template = makeTemplate({
      version: 2,
      defaultBenefits: [], // benefit_a removed
    });
    const card = makeCard({ templateVersion: 1 });

    const result = syncCardWithTemplate(card, template, "2026-04-16");
    const expired = result.card.benefits[0];

    expect(expired.expired).toBe(true);
    expect(expired.expiredAt).toBe("2026-04-16");
    expect(expired.usageRecords).toEqual([]); // preserved
    expect(expired.templateBenefitId).toBe("benefit_a");

    expect(result.changes).toEqual([
      { type: "expired", templateBenefitId: "benefit_a", benefitName: "Benefit A" },
    ]);
  });

  it("removes expired benefits after card anniversary passes", () => {
    const template = makeTemplate({
      version: 2,
      defaultBenefits: [],
    });
    const card = makeCard({
      templateVersion: 1,
      cardOpenDate: "2025-06-15", // anniversary is June 15
      benefits: [
        {
          id: "b-1",
          templateBenefitId: "benefit_a",
          name: "Benefit A",
          description: "Desc A",
          faceValue: 100,
          category: "travel",
          resetType: "calendar",
          resetConfig: { period: "annual" },
          isHidden: false,
          rolloverable: false,
          rolloverMaxYears: 2,
          usageRecords: [],
          expired: true,
          expiredAt: "2026-01-10", // expired before next anniversary (2026-06-15)
        },
      ],
    });

    // Today is after the anniversary (2026-06-15)
    const result = syncCardWithTemplate(card, template, "2026-07-01");
    expect(result.card.benefits).toHaveLength(0);
    expect(result.changes).toEqual([
      { type: "cleaned", templateBenefitId: "benefit_a", benefitName: "Benefit A" },
    ]);
  });

  it("keeps expired benefits if anniversary has not passed yet", () => {
    const template = makeTemplate({
      version: 2,
      defaultBenefits: [],
    });
    const card = makeCard({
      templateVersion: 2, // already synced to v2
      cardOpenDate: "2025-06-15",
      benefits: [
        {
          id: "b-1",
          templateBenefitId: "benefit_a",
          name: "Benefit A",
          description: "Desc A",
          faceValue: 100,
          category: "travel",
          resetType: "calendar",
          resetConfig: { period: "annual" },
          isHidden: false,
          rolloverable: false,
          rolloverMaxYears: 2,
          usageRecords: [],
          expired: true,
          expiredAt: "2026-04-01", // expired, next anniversary is 2026-06-15
        },
      ],
    });

    // Today is before the anniversary
    const result = syncCardWithTemplate(card, template, "2026-05-01");
    expect(result.card.benefits).toHaveLength(1);
    expect(result.changes).toHaveLength(0);
  });

  it("leaves custom benefits (no templateBenefitId) untouched", () => {
    const template = makeTemplate({ version: 2 });
    const customBenefit = {
      id: "custom-1",
      name: "My Custom Perk",
      description: "Custom",
      faceValue: 50,
      category: "other" as const,
      resetType: "one_time" as const,
      resetConfig: {},
      isHidden: false,
      rolloverable: false,
      rolloverMaxYears: 2,
      usageRecords: [],
    };
    const card = makeCard({
      templateVersion: 1,
      benefits: [...makeCard().benefits, customBenefit],
    });

    const result = syncCardWithTemplate(card, template, "2026-04-16");
    const custom = result.card.benefits.find((b) => b.id === "custom-1");
    if (!custom) throw new Error("expected custom benefit to be preserved");
    expect(custom.name).toBe("My Custom Perk");
    // custom benefit has no templateBenefitId, should not be touched
    expect(custom.templateBenefitId).toBeUndefined();
  });

  it("reports no changes when template fields are identical to existing benefit", () => {
    const template = makeTemplate({ version: 2 });
    const card = makeCard({ templateVersion: 1 }); // benefit_a already matches template v2

    const result = syncCardWithTemplate(card, template, "2026-04-16");
    expect(result.card.templateVersion).toBe(2);
    // No "modified" change because all fields are identical
    expect(result.changes).toHaveLength(0);
  });

  it("removes expired benefits exactly on the anniversary date (boundary)", () => {
    const template = makeTemplate({
      version: 2,
      defaultBenefits: [],
    });
    const card = makeCard({
      templateVersion: 2,
      cardOpenDate: "2025-06-15",
      benefits: [
        {
          id: "b-1",
          templateBenefitId: "benefit_a",
          name: "Benefit A",
          description: "Desc A",
          faceValue: 100,
          category: "travel",
          resetType: "calendar",
          resetConfig: { period: "annual" },
          isHidden: false,
          rolloverable: false,
          rolloverMaxYears: 2,
          usageRecords: [],
          expired: true,
          expiredAt: "2026-01-10",
        },
      ],
    });

    // Today IS the anniversary
    const result = syncCardWithTemplate(card, template, "2026-06-15");
    expect(result.card.benefits).toHaveLength(0);
    expect(result.changes).toEqual([
      { type: "cleaned", templateBenefitId: "benefit_a", benefitName: "Benefit A" },
    ]);
  });

  it("does not remove expired benefits one day before anniversary", () => {
    const template = makeTemplate({
      version: 2,
      defaultBenefits: [],
    });
    const card = makeCard({
      templateVersion: 2,
      cardOpenDate: "2025-06-15",
      benefits: [
        {
          id: "b-1",
          templateBenefitId: "benefit_a",
          name: "Benefit A",
          description: "Desc A",
          faceValue: 100,
          category: "travel",
          resetType: "calendar",
          resetConfig: { period: "annual" },
          isHidden: false,
          rolloverable: false,
          rolloverMaxYears: 2,
          usageRecords: [],
          expired: true,
          expiredAt: "2026-01-10",
        },
      ],
    });

    // Today is one day before anniversary
    const result = syncCardWithTemplate(card, template, "2026-06-14");
    expect(result.card.benefits).toHaveLength(1);
    expect(result.changes).toHaveLength(0);
  });

  it("returns card unchanged and logs a warning when card templateVersion is newer than template", () => {
    const transport = createMockTransport();
    setGlobalTransports([transport]);

    const card = makeCard({ templateVersion: 5 });
    const template = makeTemplate({ version: 2 });

    const result = syncCardWithTemplate(card, template, "2026-04-16");

    // Card should be returned unchanged (same reference — no fields stomped)
    expect(result.card).toBe(card);
    expect(result.changes).toHaveLength(0);

    // A warning should be logged about the anomalous state
    const warnings = transport.entries.filter((e) => e.level === "warn");
    expect(warnings).toHaveLength(1);
    expect(warnings[0].module).toBe("templateSync");
  });
});

describe("syncAllCardsWithTemplates", () => {
  it("syncs each card against its matching template", () => {
    const templates: CardType[] = [
      makeTemplate({
        slug: "card_a",
        version: 2,
        defaultBenefits: [
          {
            templateBenefitId: "b1",
            name: "Updated B1",
            description: "New",
            faceValue: 999,
            category: "travel",
            resetType: "calendar",
            resetConfig: { period: "annual" },
          },
        ],
      }),
    ];
    const cards: CreditCard[] = [
      makeCard({
        cardTypeSlug: "card_a",
        templateVersion: 1,
        benefits: [
          {
            id: "x",
            templateBenefitId: "b1",
            name: "Old B1",
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
      }),
    ];

    const result = syncAllCardsWithTemplates(cards, templates, "2026-04-16");
    expect(result.cards[0].benefits[0].name).toBe("Updated B1");
    expect(result.cards[0].benefits[0].faceValue).toBe(999);
    expect(result.hasChanges).toBe(true);
  });

  it("skips cards with no matching template", () => {
    const templates: CardType[] = [makeTemplate({ slug: "other" })];
    const cards: CreditCard[] = [makeCard({ cardTypeSlug: "no_match" })];

    const result = syncAllCardsWithTemplates(cards, templates, "2026-04-16");
    expect(result.cards[0]).toBe(cards[0]); // unchanged reference
    expect(result.hasChanges).toBe(false);
  });

  it("returns hasChanges=false when all cards are already in sync", () => {
    const templates: CardType[] = [makeTemplate({ slug: "test_card", version: 1 })];
    const cards: CreditCard[] = [makeCard({ cardTypeSlug: "test_card", templateVersion: 1 })];

    const result = syncAllCardsWithTemplates(cards, templates, "2026-04-16");
    expect(result.hasChanges).toBe(false);
  });
});
