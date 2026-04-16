import type { Benefit, CreditCard, UsageRecord } from "../models/types";
import { formatDate, isApplicableNow, isBenefitUsedInPeriod, isInCurrentCycle } from "./period";
import { getScopeWindow, getScopeCycles, findCycleRecord } from "./cycles";
import type { PeriodCycle } from "./cycles";
import { latestHasPropagate } from "./usageRecords";

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

const calendarYearScope = (today: Date, cardOpenDate: string) =>
  getScopeWindow("calendar", today, cardOpenDate);

const isMonthlyLike = (b: Benefit): boolean =>
  (b.resetType === "calendar" && b.resetConfig.period === "monthly") ||
  b.resetType === "subscription";

const isStandardOnly = (b: Benefit): boolean =>
  b.resetType === "one_time" || b.resetType === "since_last_use";

const buildAggregate = (
  benefit: Benefit,
  cycles: PeriodCycle[],
  kind: "used" | "unused" | "all",
  propagatesForwardOverride: boolean,
): BenefitDisplayItem["aggregate"] => {
  const months: AggregatedMonth[] = cycles.map((cycle) => {
    const record = findCycleRecord(benefit, cycle);
    const used = propagatesForwardOverride || record !== undefined;
    return {
      label: cycle.label,
      used,
      record,
      faceValue: benefit.faceValue,
      cycleStart: cycle.start,
      cycleEnd: cycle.end,
    };
  });
  const usedCount = months.filter((m) => m.used).length;
  const unusedCount = months.length - usedCount;
  const totalActualValue = months.reduce(
    (s, m) => s + (m.record?.actualValue ?? 0),
    0,
  );
  const totalFaceValue = months.reduce((s, m) => s + m.faceValue, 0);
  return { kind, months, usedCount, unusedCount, totalActualValue, totalFaceValue };
};

const perCycleItem = (
  benefit: Benefit,
  card: CreditCard,
  cycle: PeriodCycle,
  record: UsageRecord | undefined,
): BenefitDisplayItem => ({
  benefit,
  card,
  key: `${benefit.id}::${cycle.label}`,
  variant: "per-cycle",
  periodLabel: cycle.label,
  periodStart: cycle.start,
  periodEnd: cycle.end,
  cycleUsed: record !== undefined,
  cycleRecord: record,
});

const expandUnused = (
  card: CreditCard,
  today: Date,
  scope: YearScope,
): BenefitDisplayItem[] => {
  const window = getScopeWindow(scope, today, card.cardOpenDate);
  const items: BenefitDisplayItem[] = [];
  for (const b of card.benefits) {
    if (b.isHidden) continue;
    if (isStandardOnly(b)) {
      if (!isInCurrentCycle(b, today)) continue;
      if (isBenefitUsedInPeriod(b, today, card.cardOpenDate, card.statementClosingDay)) continue;
      items.push(standardItem(b, card));
      continue;
    }
    if (b.resetType === "subscription" && latestHasPropagate(b)) continue; // never unused
    const cycles = getScopeCycles(b, window, card.cardOpenDate);
    if (isMonthlyLike(b)) {
      const unusedCycles = cycles.filter((c) => !findCycleRecord(b, c));
      if (unusedCycles.length === 0) continue;
      const aggregate = buildAggregate(b, unusedCycles, "unused", false);
      items.push({
        benefit: b,
        card,
        key: `${b.id}::agg-unused`,
        variant: "aggregated",
        aggregate,
      });
    } else {
      const todayIso = formatDate(today);
      for (const cycle of cycles) {
        // Anniversary benefits allocate one credit per cycle. Once the cycle
        // ends, that year's credit is forfeit and the cycle is no longer
        // actionable — hide past cycles from "未使用".
        if (b.resetType === "anniversary" && cycle.end < todayIso) continue;
        if (!findCycleRecord(b, cycle)) {
          items.push(perCycleItem(b, card, cycle, undefined));
        }
      }
    }
  }
  return items;
};

const expandUsed = (card: CreditCard, today: Date): BenefitDisplayItem[] => {
  const window = calendarYearScope(today, card.cardOpenDate);
  const items: BenefitDisplayItem[] = [];
  for (const b of card.benefits) {
    if (b.isHidden) continue;
    if (isStandardOnly(b)) {
      const hasUseThisYear = b.usageRecords.some(
        (r) => r.usedDate >= window.start && r.usedDate <= window.end,
      );
      if (hasUseThisYear) items.push(standardItem(b, card));
      continue;
    }
    const cycles = getScopeCycles(b, window, card.cardOpenDate);
    if (isMonthlyLike(b)) {
      const propagatesForward = b.resetType === "subscription" && latestHasPropagate(b);
      const usedCycles = propagatesForward
        ? cycles
        : cycles.filter((c) => findCycleRecord(b, c));
      if (usedCycles.length === 0) continue;
      const aggregate = buildAggregate(b, usedCycles, "used", propagatesForward);
      items.push({
        benefit: b,
        card,
        key: `${b.id}::agg-used`,
        variant: "aggregated",
        aggregate,
      });
    } else {
      for (const cycle of cycles) {
        const record = findCycleRecord(b, cycle);
        if (record) items.push(perCycleItem(b, card, cycle, record));
      }
    }
  }
  return items;
};

const expandAll = (
  card: CreditCard,
  today: Date,
  scope: YearScope,
): BenefitDisplayItem[] => {
  const window = getScopeWindow(scope, today, card.cardOpenDate);
  const items: BenefitDisplayItem[] = [];
  for (const b of card.benefits) {
    // No hidden filter — include them
    if (isStandardOnly(b)) {
      items.push(standardItem(b, card));
      continue;
    }
    const cycles = getScopeCycles(b, window, card.cardOpenDate);
    if (isMonthlyLike(b)) {
      if (cycles.length === 0) continue;
      const propagatesForward = b.resetType === "subscription" && latestHasPropagate(b);
      const aggregate = buildAggregate(b, cycles, "all", propagatesForward);
      items.push({
        benefit: b,
        card,
        key: `${b.id}::agg-all`,
        variant: "aggregated",
        aggregate,
      });
    } else {
      for (const cycle of cycles) {
        items.push(perCycleItem(b, card, cycle, findCycleRecord(b, cycle)));
      }
    }
  }
  return items;
};

export const expandBenefitsForFilter = (
  card: CreditCard,
  filter: FilterMode,
  today: Date,
  scope: YearScope,
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
      .filter((b) => !isBenefitUsedInPeriod(b, today, card.cardOpenDate, card.statementClosingDay))
      .map((b) => standardItem(b, card));
  }

  if (filter === "used") return expandUsed(card, today);

  if (filter === "unused") return expandUnused(card, today, scope);

  // all
  return expandAll(card, today, scope);
};
