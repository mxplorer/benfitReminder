import type { Benefit, CalendarPeriod, UsageRecord } from "../models/types";
import type { DateRange } from "./period";
import { getCalendarPeriodRange } from "./period";
import { cycleKeyForRecord, currentCycleKey } from "./cycleKey";
import { makeRolloverRecord } from "./usageRecords";

export const getPeriodRangeAt = (
  date: Date,
  period: CalendarPeriod,
): DateRange => {
  return getCalendarPeriodRange(date, period);
};

export const getPreviousPeriodStart = (
  periodStart: Date,
  period: CalendarPeriod,
): Date => {
  const year = periodStart.getFullYear();
  const month = periodStart.getMonth(); // 0-based
  switch (period) {
    case "monthly":
      return new Date(year, month - 1, 1);
    case "quarterly":
      return new Date(year, month - 3, 1);
    case "semi_annual":
      return new Date(year, month - 6, 1);
    case "annual":
      return new Date(year - 1, 0, 1);
    case "every_4_years":
      return new Date(year - 4, 0, 1);
  }
};

const PERIOD_MULTIPLIER: Record<CalendarPeriod, number> = {
  monthly: 12,
  quarterly: 4,
  semi_annual: 2,
  annual: 1,
  every_4_years: 1,
};

export const getPastPeriods = (
  period: CalendarPeriod,
  today: Date,
  maxLookbackMonths: number,
): DateRange[] => {
  const currentRange = getPeriodRangeAt(today, period);
  const cutoff = new Date(today);
  cutoff.setMonth(cutoff.getMonth() - maxLookbackMonths);
  const cutoffStr = `${String(cutoff.getFullYear())}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-01`;

  const results: DateRange[] = [];
  let cursor = new Date(currentRange.start + "T00:00:00");
  let range = getPeriodRangeAt(cursor, period);

  // Walk backward one period at a time until the period start precedes the cutoff
  do {
    cursor = getPreviousPeriodStart(cursor, period);
    range = getPeriodRangeAt(cursor, period);
    if (range.start < cutoffStr) break;
    results.push(range);
  } while (range.start >= cutoffStr);

  return results;
};

/** Distributes `rolloverAmount` across prior cycles, most-recent-first.
 * Each generated record stores the actual amount rolled from that cycle,
 * capped at `benefit.faceValue`. Example (faceValue=300, maxYears=2 annual):
 *   - $23   → 1 record in prior cycle, faceValue=23
 *   - $450  → 2 records: prev=300, prev-1=150
 *   - $2000 → capped at maxYears*multiplier; excess drops off.
 *
 * Does NOT write a current-cycle marker — callers (e.g. the dialog's save
 * handler) decide whether to add that separately. */
export const generateRolloverRecords = (
  benefit: Benefit,
  rolloverAmount: number,
  today: Date,
): UsageRecord[] => {
  if (!benefit.rolloverable || benefit.faceValue <= 0 || rolloverAmount <= 0) return [];
  const period = benefit.resetConfig.period;
  if (!period) return [];

  const maxPeriods = benefit.rolloverMaxYears * PERIOD_MULTIPLIER[period];

  const records: UsageRecord[] = [];
  const currentRange = getPeriodRangeAt(today, period);
  let cursor = new Date(currentRange.start + "T00:00:00");
  let remaining = rolloverAmount;

  for (let i = 0; i < maxPeriods && remaining > 0; i++) {
    cursor = getPreviousPeriodStart(cursor, period);
    const prevRange = getPeriodRangeAt(cursor, period);
    const thisAmount = Math.min(remaining, benefit.faceValue);
    records.push(makeRolloverRecord(prevRange.start, thisAmount));
    remaining -= thisAmount;
  }

  return records;
};

/** Total face value this cycle has access to: the benefit's own faceValue
 * plus whatever was rolled in from prior cycles. Does NOT subtract
 * consumption — this is the ceiling, not the remaining. */
export const getTotalFaceWithRollover = (
  benefit: Benefit,
  today: Date,
): number => {
  if (!benefit.rolloverable || benefit.resetType !== "calendar")
    return benefit.faceValue;

  const period = benefit.resetConfig.period;
  if (!period) return benefit.faceValue;

  const maxPeriods = benefit.rolloverMaxYears * PERIOD_MULTIPLIER[period];
  const currentRange = getPeriodRangeAt(today, period);
  let accumulated = benefit.faceValue;
  let lookbackStart = new Date(currentRange.start + "T00:00:00");
  let periodsChecked = 0;

  while (periodsChecked < maxPeriods) {
    lookbackStart = getPreviousPeriodStart(lookbackStart, period);
    const prevRange = getPeriodRangeAt(lookbackStart, period);
    const recordInPeriod = benefit.usageRecords.find(
      (r) => r.usedDate >= prevRange.start && r.usedDate <= prevRange.end,
    );
    if (!recordInPeriod) break;
    if (recordInPeriod.kind !== "rollover") break;
    accumulated += recordInPeriod.faceValue;
    periodsChecked++;
  }

  return accumulated;
};

/** Sum of `faceValue` across all records (usage or rollover) that live in
 * the current cycle. Mirrors period.ts#getConsumedInPeriod but lives here
 * to avoid a circular import — period.ts already depends on rollover.ts. */
const consumedInCurrentCycle = (benefit: Benefit, today: Date): number => {
  const key = currentCycleKey(today, benefit);
  if (!key) return 0;
  return benefit.usageRecords
    .filter((r) => cycleKeyForRecord(r, benefit, "") === key)
    .reduce((sum, r) => sum + r.faceValue, 0);
};

/** Remaining face value in the current cycle: totalFace (own + rolled-in)
 * minus what's already been consumed (sum of record.faceValue in cycle).
 * Clamped to >= 0 so callers don't have to worry about over-consumption. */
export const getAvailableValue = (benefit: Benefit, today: Date): number => {
  const totalFace = getTotalFaceWithRollover(benefit, today);
  const consumed = consumedInCurrentCycle(benefit, today);
  return Math.max(0, totalFace - consumed);
};
