import type { Benefit, CreditCard, UsageRecord } from "../models/types";
import { isApplicableNow, isBenefitUsedInPeriod } from "./period";

export type FilterMode = "available" | "unused" | "used" | "hidden" | "all";
export type YearScope = "calendar" | "anniversary";

export interface AggregatedMonth {
  label: string;
  used: boolean;
  record?: UsageRecord;
  faceValue: number;
  cycleStart: string;
  cycleEnd: string;
}

export interface BenefitDisplayItem {
  benefit: Benefit;
  card: CreditCard;
  key: string;
  variant: "standard" | "per-cycle" | "aggregated";
  periodLabel?: string;
  periodStart?: string;
  periodEnd?: string;
  cycleUsed?: boolean;
  cycleRecord?: UsageRecord;
  aggregate?: {
    kind: "used" | "unused" | "all";
    months: AggregatedMonth[];
    usedCount: number;
    unusedCount: number;
    totalActualValue: number;
    totalFaceValue: number;
  };
}

const standardItem = (benefit: Benefit, card: CreditCard): BenefitDisplayItem => ({
  benefit,
  card,
  key: benefit.id,
  variant: "standard",
});

export const expandBenefitsForFilter = (
  card: CreditCard,
  filter: FilterMode,
  today: Date,
  _scope: YearScope,
): BenefitDisplayItem[] => {
  if (filter === "hidden") {
    return card.benefits
      .filter((b) => b.isHidden)
      .map((b) => standardItem(b, card));
  }

  if (filter === "available") {
    return card.benefits
      .filter((b) => !b.isHidden)
      .filter((b) => isApplicableNow(b, today))
      .filter((b) => !isBenefitUsedInPeriod(b, today, card.cardOpenDate))
      .map((b) => standardItem(b, card));
  }

  // unused / used / all — Tasks 5–7
  return [];
};
