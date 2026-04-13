import type { Benefit, CalendarPeriod } from "../models/types";
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
