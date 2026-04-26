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
  it("treats legacy card benefits as custom and adds all template benefits", () => {
    const template = findCardType("amex_platinum");

    const legacyCard: CreditCard = {
      id: "legacy-1",
      owner: "Test User",
      cardTypeSlug: "amex_platinum",
      annualFee: template.defaultAnnualFee,
      cardOpenDate: "2024-01-15",
      color: template.color,
      isEnabled: true,
      benefits: [
        {
          id: "old-b",
          name: "$200 Airline Fee Credit",
          description: "Legacy airline credit",
          faceValue: 200,
          category: "airline",
          resetType: "calendar",
          resetConfig: { period: "annual" },
          isHidden: false,
          rolloverable: false,
          rolloverMaxYears: 2,
          usageRecords: [],
          // NO templateBenefitId — legacy benefit
        },
      ],
      // NO templateVersion — legacy card
    };

    const result = syncAllCardsWithTemplates([legacyCard], [template], "2026-04-16");
    const synced = result.cards[0];

    expect(synced).toBeDefined();
    expect(synced.templateVersion).toBe(2);

    // Legacy benefit kept as custom (no templateBenefitId assigned)
    const oldBenefit = synced.benefits.find((b) => b.id === "old-b");
    expect(oldBenefit).toBeDefined();
    if (!oldBenefit) return; // type narrow without `!`
    expect(oldBenefit.templateBenefitId).toBeUndefined();

    // All template benefits added as new
    const templateBenefits = synced.benefits.filter((b) => b.templateBenefitId);
    expect(templateBenefits).toHaveLength(template.defaultBenefits.length);

    expect(result.hasChanges).toBe(true);
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
      templateVersion: 2,
    };

    const result = syncAllCardsWithTemplates([syncedCard], [template], "2026-04-16");

    expect(result.hasChanges).toBe(false);

    // Fast path: exact same object reference returned (no unnecessary copies)
    expect(result.cards[0]).toBe(syncedCard);
  });
});
