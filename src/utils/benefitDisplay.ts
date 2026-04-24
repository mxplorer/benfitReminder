import type { Benefit, CreditCard, UsageRecord } from "../models/types";
import { formatDate, isApplicableNow, isBenefitUsedInPeriod, isInCurrentCycle } from "./period";
import { getScopeWindow, getScopeCycles, findCycleRecord } from "./cycles";
import type { PeriodCycle } from "./cycles";
import { cycleKeyForDate, cycleKeyForRecord } from "./cycleKey";

export type FilterMode = "available" | "unused" | "used" | "hidden" | "all";
export type YearScope = "calendar" | "anniversary";

export interface AggregatedMonth {
  label: string;
  used: boolean;
  record?: UsageRecord;
  faceValue: number;
  /** Sum of `record.faceValue` for every record (usage + rollover) that
   * falls in this cycle. Drives the new "cumulative consumption" model:
   * `used` flips when consumedValue >= faceValue (for face>0 benefits).
   *
   * Optional for backward compatibility with legacy fixture construction
   * sites (e.g., BackfillDialog); the canonical `buildAggregate` always
   * provides it. Later batches will make this required once all
   * constructors are migrated. */
  consumedValue?: number;
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

/** Sum of all records (any kind) whose cycleKey matches the given cycle. */
const consumedForCycle = (
  benefit: Benefit,
  cycle: PeriodCycle,
  cardOpenDate: string,
): number => {
  const key = cycleKeyForDate(cycle.start, benefit, cardOpenDate);
  return benefit.usageRecords
    .filter((r) => cycleKeyForRecord(r, benefit, cardOpenDate) === key)
    .reduce((sum, r) => sum + r.faceValue, 0);
};

/** Sum of rollover.faceValue in the cycle immediately preceding `cycle` —
 * i.e., how much face was rolled forward INTO `cycle`. Keyed off prev
 * cycle's cycleKey (day before `cycle.start`) so it works uniformly across
 * monthly / quarterly / annual / anniversary. */
const cycleInbound = (
  benefit: Benefit,
  cycle: PeriodCycle,
  cardOpenDate: string,
): number => {
  const dayBefore = new Date(cycle.start + "T00:00:00");
  dayBefore.setDate(dayBefore.getDate() - 1);
  const prevKey = cycleKeyForDate(formatDate(dayBefore), benefit, cardOpenDate);
  return benefit.usageRecords
    .filter(
      (r) =>
        r.kind === "rollover" &&
        cycleKeyForRecord(r, benefit, cardOpenDate) === prevKey,
    )
    .reduce((sum, r) => sum + r.faceValue, 0);
};

/** Per-cycle ceiling: intrinsic face + inbound rollover from prev cycle. */
const cycleTotalFace = (
  benefit: Benefit,
  cycle: PeriodCycle,
  cardOpenDate: string,
): number => benefit.faceValue + cycleInbound(benefit, cycle, cardOpenDate);

/** Sum of actualValue across all records (any kind) in the cycle. */
const actualValueForCycle = (
  benefit: Benefit,
  cycle: PeriodCycle,
  cardOpenDate: string,
): number => {
  const key = cycleKeyForDate(cycle.start, benefit, cardOpenDate);
  return benefit.usageRecords
    .filter((r) => cycleKeyForRecord(r, benefit, cardOpenDate) === key)
    .reduce((sum, r) => sum + r.actualValue, 0);
};

/** True when any record in the cycle is kind "usage" (rollover-only doesn't
 * count). Used for faceValue == 0 benefits where cumulative model doesn't
 * apply. */
const hasUsageRecordInCycle = (
  benefit: Benefit,
  cycle: PeriodCycle,
  cardOpenDate: string,
): boolean => {
  const key = cycleKeyForDate(cycle.start, benefit, cardOpenDate);
  return benefit.usageRecords.some(
    (r) => r.kind === "usage" && cycleKeyForRecord(r, benefit, cardOpenDate) === key,
  );
};

/** Number of records (any kind) in the cycle. */
const recordCountInCycle = (
  benefit: Benefit,
  cycle: PeriodCycle,
  cardOpenDate: string,
): number => {
  const key = cycleKeyForDate(cycle.start, benefit, cardOpenDate);
  return benefit.usageRecords.filter(
    (r) => cycleKeyForRecord(r, benefit, cardOpenDate) === key,
  ).length;
};

/** Cycle starts after today — future cycle. ISO string compare is
 * sufficient since both inputs are `YYYY-MM-DD`. */
const isNotYetActive = (cycle: PeriodCycle, todayIso: string): boolean =>
  cycle.start > todayIso;

/** Strict "未使用" filter membership per the new spec: a cycle qualifies
 * when it has zero records OR it hasn't started yet. A future cycle
 * dominates — even if a propagated record has been materialised ahead of
 * time, the cycle still belongs in 未使用. */
const isInUnusedFilter = (
  benefit: Benefit,
  cycle: PeriodCycle,
  todayIso: string,
  cardOpenDate: string,
): boolean => {
  if (isNotYetActive(cycle, todayIso)) return true;
  return recordCountInCycle(benefit, cycle, cardOpenDate) === 0;
};

/** Per-cycle "used" decision used when walking cycles inside a card.
 *   - faceValue > 0: consumed >= per-cycle totalFace (intrinsic + inbound
 *     rollover). consumed sums current-cycle records; outbound rollover
 *     in the current cycle counts toward consumed.
 *   - faceValue == 0: any usage kind record in the cycle */
const isCycleUsed = (
  benefit: Benefit,
  cycle: PeriodCycle,
  cardOpenDate: string,
): boolean => {
  if (benefit.faceValue > 0) {
    const consumed = consumedForCycle(benefit, cycle, cardOpenDate);
    const totalFace = cycleTotalFace(benefit, cycle, cardOpenDate);
    return consumed >= totalFace;
  }
  return hasUsageRecordInCycle(benefit, cycle, cardOpenDate);
};

const buildAggregate = (
  benefit: Benefit,
  cycles: PeriodCycle[],
  kind: "used" | "unused" | "all",
  cardOpenDate: string,
): BenefitDisplayItem["aggregate"] => {
  const months: AggregatedMonth[] = cycles.map((cycle) => {
    const record = findCycleRecord(benefit, cycle, cardOpenDate);
    const consumedValue = consumedForCycle(benefit, cycle, cardOpenDate);
    // Cumulative face-value rule:
    //   faceValue > 0 → used when consumed >= totalFace (face + inbound rollover)
    //   faceValue == 0 → used when cycle has any "usage" kind record
    const used = isCycleUsed(benefit, cycle, cardOpenDate);
    return {
      label: cycle.label,
      used,
      record,
      faceValue: cycleTotalFace(benefit, cycle, cardOpenDate),
      consumedValue,
      cycleStart: cycle.start,
      cycleEnd: cycle.end,
    };
  });
  const usedCount = months.filter((m) => m.used).length;
  const unusedCount = months.length - usedCount;
  // totalActualValue now sums across all records in the cycle, not just the
  // "representative" one — matches the new multi-record-per-cycle model.
  const totalActualValue = cycles.reduce(
    (sum, cycle) => sum + actualValueForCycle(benefit, cycle, cardOpenDate),
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
  const todayIso = formatDate(today);
  const items: BenefitDisplayItem[] = [];
  for (const b of card.benefits) {
    if (b.isHidden) continue;
    if (isStandardOnly(b)) {
      if (!isInCurrentCycle(b, today)) continue;
      if (isBenefitUsedInPeriod(b, today, card.cardOpenDate)) continue;
      items.push(standardItem(b, card));
      continue;
    }
    // Strict "未使用" rule: cycle qualifies iff it has no records OR starts
    // after today. The prior subscription-propagate short-circuit is
    // superseded by `isNotYetActive` — a future cycle with a pre-
    // materialised propagate record still belongs in 未使用.
    const cycles = getScopeCycles(b, window, card.cardOpenDate);
    if (isMonthlyLike(b)) {
      const unusedCycles = cycles.filter((c) =>
        isInUnusedFilter(b, c, todayIso, card.cardOpenDate),
      );
      if (unusedCycles.length === 0) continue;
      const aggregate = buildAggregate(b, unusedCycles, "unused", card.cardOpenDate);
      items.push({
        benefit: b,
        card,
        key: `${b.id}::agg-unused`,
        variant: "aggregated",
        aggregate,
      });
    } else {
      for (const cycle of cycles) {
        // Anniversary benefits allocate one credit per cycle. Once the cycle
        // ends, that year's credit is forfeit and the cycle is no longer
        // actionable — hide past cycles from "未使用".
        if (b.resetType === "anniversary" && cycle.end < todayIso) continue;
        if (isInUnusedFilter(b, cycle, todayIso, card.cardOpenDate)) {
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
      // Cumulative face-value rule: a cycle is "used" when consumed >=
      // faceValue (for face>0) or when any usage record exists (for
      // face==0). Partial-consumed cycles go into available, not used.
      const usedCycles = cycles.filter((c) =>
        isCycleUsed(b, c, card.cardOpenDate),
      );
      if (usedCycles.length === 0) continue;
      const aggregate = buildAggregate(b, usedCycles, "used", card.cardOpenDate);
      items.push({
        benefit: b,
        card,
        key: `${b.id}::agg-used`,
        variant: "aggregated",
        aggregate,
      });
    } else {
      for (const cycle of cycles) {
        if (isCycleUsed(b, cycle, card.cardOpenDate)) {
          const record = findCycleRecord(b, cycle, card.cardOpenDate);
          items.push(perCycleItem(b, card, cycle, record));
        }
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
      const aggregate = buildAggregate(b, cycles, "all", card.cardOpenDate);
      items.push({
        benefit: b,
        card,
        key: `${b.id}::agg-all`,
        variant: "aggregated",
        aggregate,
      });
    } else {
      for (const cycle of cycles) {
        const record = findCycleRecord(b, cycle, card.cardOpenDate);
        // cycleUsed reflects the new cumulative rule.
        const cycleUsed = isCycleUsed(b, cycle, card.cardOpenDate);
        items.push({
          ...perCycleItem(b, card, cycle, record),
          cycleUsed,
        });
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
      .filter((b) => !isBenefitUsedInPeriod(b, today, card.cardOpenDate))
      .map((b) => standardItem(b, card));
  }

  if (filter === "used") return expandUsed(card, today);

  if (filter === "unused") return expandUnused(card, today, scope);

  // all
  return expandAll(card, today, scope);
};
