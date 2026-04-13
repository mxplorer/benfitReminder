import type { Benefit, CalendarPeriod, UsageRecord } from "../models/types";
import type { DateRange } from "./period";
import { getCalendarPeriodRange } from "./period";

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

export const generateRolloverRecords = (
  benefit: Benefit,
  rolloverAmount: number,
  today: Date,
): UsageRecord[] => {
  if (!benefit.rolloverable || benefit.faceValue <= 0 || rolloverAmount <= 0) return [];
  const period = benefit.resetConfig.period;
  if (!period) return [];

  const maxPeriods = benefit.rolloverMaxYears * PERIOD_MULTIPLIER[period];
  let periodsNeeded = Math.floor(rolloverAmount / benefit.faceValue);
  periodsNeeded = Math.min(periodsNeeded, maxPeriods);

  const records: UsageRecord[] = [];
  const currentRange = getPeriodRangeAt(today, period);
  let cursor = new Date(currentRange.start + "T00:00:00");

  for (let i = 0; i < periodsNeeded; i++) {
    cursor = getPreviousPeriodStart(cursor, period);
    const prevRange = getPeriodRangeAt(cursor, period);
    records.push({ usedDate: prevRange.start, faceValue: 0, actualValue: 0, isRollover: true });
  }

  return records;
};

export const getAvailableValue = (benefit: Benefit, today: Date): number => {
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
    if (!recordInPeriod.isRollover) break;
    accumulated += benefit.faceValue;
    periodsChecked++;
  }

  return accumulated;
};
