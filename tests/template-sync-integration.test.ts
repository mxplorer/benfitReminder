import { describe, it, expect } from "vitest";
import type { Benefit, CreditCard } from "../src/models/types";
import { BUILTIN_CARD_TYPES } from "../src/models/templates";
import { syncAllCardsWithTemplates } from "../src/utils/templateSync";

// Helper that throws instead of returning undefined — avoids non-null assertions
const findCardType = (slug: string) => {
  const card = BUILTIN_CARD_TYPES.find((c) => c.slug === slug);
  if (!card) throw new Error(`Card type '${slug}' not found in BUILTIN_CARD_TYPES`);
  return card;
};

describe("syncAllCardsWithTemplates — integration against real built-in templates", () => {
  it("syncs a legacy amex_platinum card to v1", () => {
    const template = findCardType("amex_platinum");

    // Build a legacy card: benefits have no templateBenefitId, card has no templateVersion
    const legacyBenefits: Benefit[] = template.defaultBenefits.map((tmpl) => ({
      id: crypto.randomUUID(),
      // omit templateBenefitId — simulating pre-versioning legacy data
      name: tmpl.name,
      description: tmpl.description,
      faceValue: tmpl.faceValue,
      category: tmpl.category,
      resetType: tmpl.resetType,
      resetConfig: tmpl.resetConfig,
      isHidden: false,
      rolloverable: tmpl.rolloverable ?? false,
      rolloverMaxYears: tmpl.rolloverMaxYears ?? 2,
      usageRecords: [],
    }));

    const legacyCard: CreditCard = {
      id: "legacy-card-1",
      owner: "Test User",
      cardTypeSlug: "amex_platinum",
      annualFee: template.defaultAnnualFee,
      cardOpenDate: "2024-01-15",
      color: template.color,
      isEnabled: true,
      benefits: legacyBenefits,
      // omit templateVersion — simulating pre-versioning legacy data
    };

    const result = syncAllCardsWithTemplates([legacyCard], [template], "2026-04-16");

    expect(result.hasChanges).toBe(true);

    const synced = result.cards[0];
    // result.cards mirrors input array length; index 0 is always defined here
    expect(synced).toBeDefined();

    expect(synced.templateVersion).toBe(1);

    expect(synced.benefits).toHaveLength(template.defaultBenefits.length);

    const templateIdsByName = new Map(
      template.defaultBenefits.map((t) => [t.name, t.templateBenefitId]),
    );
    for (const b of synced.benefits) {
      expect(b.templateBenefitId, `${b.name} should match template ID`).toBe(
        templateIdsByName.get(b.name),
      );
    }
  });

  it("does not modify an already-synced card", () => {
    const template = findCardType("amex_platinum");

    // Build a fully synced card: benefits carry templateBenefitId, card has templateVersion: 1
    const syncedBenefits: Benefit[] = template.defaultBenefits.map((tmpl) => ({
      id: crypto.randomUUID(),
      templateBenefitId: tmpl.templateBenefitId,
      name: tmpl.name,
      description: tmpl.description,
      faceValue: tmpl.faceValue,
      category: tmpl.category,
      resetType: tmpl.resetType,
      resetConfig: tmpl.resetConfig,
      isHidden: false,
      rolloverable: tmpl.rolloverable ?? false,
      rolloverMaxYears: tmpl.rolloverMaxYears ?? 2,
      usageRecords: [],
    }));

    const syncedCard: CreditCard = {
      id: "synced-card-1",
      owner: "Test User",
      cardTypeSlug: "amex_platinum",
      annualFee: template.defaultAnnualFee,
      cardOpenDate: "2024-01-15",
      color: template.color,
      isEnabled: true,
      benefits: syncedBenefits,
      templateVersion: 1,
    };

    const result = syncAllCardsWithTemplates([syncedCard], [template], "2026-04-16");

    expect(result.hasChanges).toBe(false);

    // Fast path: exact same object reference returned (no unnecessary copies)
    expect(result.cards[0]).toBe(syncedCard);
  });
});
