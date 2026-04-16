import type { Benefit, BenefitTemplate, CreditCard, CardType } from "../models/types";

export interface SyncChange {
  type: "added" | "modified" | "expired" | "cleaned";
  templateBenefitId: string;
  benefitName: string;
}

/** Fields copied from template to benefit on sync. */
const TEMPLATE_FIELDS = [
  "name",
  "description",
  "faceValue",
  "category",
  "resetType",
  "resetConfig",
  "rolloverable",
  "rolloverMaxYears",
] as const;

/** Resolve the effective template value for a field, applying defaults for
 * optional fields that have defaults on the Benefit type. */
const resolveTemplateValue = (
  tmpl: BenefitTemplate,
  field: (typeof TEMPLATE_FIELDS)[number],
): unknown => {
  if (field === "rolloverable") return tmpl.rolloverable ?? false;
  if (field === "rolloverMaxYears") return tmpl.rolloverMaxYears ?? 2;
  return tmpl[field];
};

/** Check if any template-controlled field differs between benefit and template. */
const hasFieldChanges = (benefit: Benefit, tmpl: BenefitTemplate): boolean =>
  TEMPLATE_FIELDS.some((field) => {
    const bVal = benefit[field];
    const tVal = resolveTemplateValue(tmpl, field);
    if (typeof bVal === "object" || typeof tVal === "object") {
      return JSON.stringify(bVal) !== JSON.stringify(tVal);
    }
    return bVal !== tVal;
  });

/** Apply template fields onto an existing benefit, preserving user fields. */
const applyTemplateFields = (benefit: Benefit, tmpl: BenefitTemplate): Benefit => ({
  ...benefit,
  name: tmpl.name,
  description: tmpl.description,
  faceValue: tmpl.faceValue,
  category: tmpl.category,
  resetType: tmpl.resetType,
  resetConfig: tmpl.resetConfig,
  rolloverable: tmpl.rolloverable ?? false,
  rolloverMaxYears: tmpl.rolloverMaxYears ?? 2,
});

/** Create a new Benefit from a BenefitTemplate. */
const createBenefitFromTemplate = (tmpl: BenefitTemplate): Benefit => ({
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
});

/**
 * Compute the next card anniversary on or after a given date.
 * Anniversary = same month+day as cardOpenDate each year.
 */
const getNextAnniversaryAfter = (cardOpenDate: string, afterDate: string): string => {
  const open = new Date(cardOpenDate + "T00:00:00");
  const after = new Date(afterDate + "T00:00:00");
  const month = open.getMonth();
  const day = open.getDate();

  // Try same year as afterDate
  let candidate = new Date(after.getFullYear(), month, day);
  if (candidate <= after) {
    candidate = new Date(after.getFullYear() + 1, month, day);
  }
  return candidate.toISOString().slice(0, 10);
};

export const syncCardWithTemplate = (
  card: CreditCard,
  template: CardType,
  today: string,
): { card: CreditCard; changes: SyncChange[] } => {
  const changes: SyncChange[] = [];

  // Phase 3: Clean expired benefits (runs even on fast path for version-matched cards)
  const cleanedBenefits = card.benefits.filter((b) => {
    if (!b.expired || !b.expiredAt) return true;
    const nextAnniversary = getNextAnniversaryAfter(card.cardOpenDate, b.expiredAt);
    if (today >= nextAnniversary) {
      changes.push({
        type: "cleaned",
        templateBenefitId: b.templateBenefitId ?? b.id,
        benefitName: b.name,
      });
      return false;
    }
    return true;
  });

  const cardAfterClean =
    cleanedBenefits.length !== card.benefits.length
      ? { ...card, benefits: cleanedBenefits }
      : card;

  // Fast path: already in sync (but still needed cleanup check above)
  if (card.templateVersion !== undefined && card.templateVersion >= template.version) {
    if (changes.length > 0) {
      return { card: cardAfterClean, changes };
    }
    return { card, changes: [] };
  }

  // Phase 1: Legacy bootstrap — match by name to establish templateBenefitId
  let benefits = [...cardAfterClean.benefits];
  if (card.templateVersion === undefined) {
    const templateByName = new Map(
      template.defaultBenefits.map((t) => [t.name, t]),
    );
    benefits = benefits.map((b) => {
      if (b.templateBenefitId) return b; // already linked
      const match = templateByName.get(b.name);
      if (match) {
        return { ...b, templateBenefitId: match.templateBenefitId };
      }
      return b; // unmatched = custom
    });
  }

  // Phase 2: Diff & Apply by templateBenefitId
  const templateMap = new Map(
    template.defaultBenefits.map((t) => [t.templateBenefitId, t]),
  );
  const userByTemplateId = new Map<string, Benefit>();
  for (const b of benefits) {
    if (b.templateBenefitId) {
      userByTemplateId.set(b.templateBenefitId, b);
    }
  }

  // Modify existing + expire removed
  const updatedBenefits = benefits.map((b) => {
    if (!b.templateBenefitId) return b; // custom benefit, skip

    const tmpl = templateMap.get(b.templateBenefitId);
    if (!tmpl) {
      // Benefit removed from template — mark expired (if not already)
      if (!b.expired) {
        changes.push({
          type: "expired",
          templateBenefitId: b.templateBenefitId,
          benefitName: b.name,
        });
        return { ...b, expired: true, expiredAt: today };
      }
      return b;
    }

    // Benefit still in template — update fields if changed
    if (hasFieldChanges(b, tmpl)) {
      changes.push({
        type: "modified",
        templateBenefitId: b.templateBenefitId,
        benefitName: tmpl.name,
      });
      return applyTemplateFields(b, tmpl);
    }
    return b;
  });

  // Add new benefits
  for (const [tid, tmpl] of templateMap) {
    if (!userByTemplateId.has(tid)) {
      changes.push({
        type: "added",
        templateBenefitId: tid,
        benefitName: tmpl.name,
      });
      updatedBenefits.push(createBenefitFromTemplate(tmpl));
    }
  }

  return {
    card: {
      ...cardAfterClean,
      benefits: updatedBenefits,
      templateVersion: template.version,
    },
    changes,
  };
};
