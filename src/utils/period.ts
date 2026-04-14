import type { Benefit, CalendarPeriod, ResetConfig, ResetType } from "../models/types";

export interface DateRange {
  start: string;
  end: string;
}

export interface PeriodInput {
  resetType: ResetType;
  resetConfig: ResetConfig;
  cardOpenDate?: string;
}

export const formatDate = (d: Date): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${String(year)}-${month}-${day}`;
};

export const lastDay = (year: number, month: number): number => {
  return new Date(year, month, 0).getDate();
};

export const getMonthRange = (year: number, month: number): DateRange => {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month - 1, lastDay(year, month));
  return { start: formatDate(start), end: formatDate(end) };
};

export const getCalendarPeriodRange = (
  today: Date,
  period: CalendarPeriod,
): DateRange => {
  const year = today.getFullYear();
  const month = today.getMonth() + 1;

  switch (period) {
    case "monthly":
      return getMonthRange(year, month);

    case "quarterly": {
      const qStart = Math.floor((month - 1) / 3) * 3 + 1;
      const qEnd = qStart + 2;
      return {
        start: formatDate(new Date(year, qStart - 1, 1)),
        end: formatDate(new Date(year, qEnd - 1, lastDay(year, qEnd))),
      };
    }

    case "semi_annual": {
      if (month <= 6) {
        return {
          start: formatDate(new Date(year, 0, 1)),
          end: formatDate(new Date(year, 5, 30)),
        };
      }
      return {
        start: formatDate(new Date(year, 6, 1)),
        end: formatDate(new Date(year, 11, 31)),
      };
    }

    case "annual":
      return {
        start: formatDate(new Date(year, 0, 1)),
        end: formatDate(new Date(year, 11, 31)),
      };

    case "every_4_years": {
      const blockStart = year - (year % 4);
      return {
        start: formatDate(new Date(blockStart, 0, 1)),
        end: formatDate(new Date(blockStart + 3, 11, 31)),
      };
    }
  }
};

// Clamp day to last day of target month (handles Feb 29 in non-leap years)
const clampDate = (year: number, month: number, day: number): Date => {
  const maxDay = lastDay(year, month + 1); // month is 0-indexed, lastDay expects 1-indexed
  return new Date(year, month, Math.min(day, maxDay));
};

export const getAnniversaryRange = (today: Date, cardOpenDate: string): DateRange => {
  const open = new Date(cardOpenDate + "T00:00:00");
  const openMonth = open.getMonth();
  const openDay = open.getDate();
  const year = today.getFullYear();

  const anniversaryThisYear = clampDate(year, openMonth, openDay);
  let periodStart: Date;

  if (today >= anniversaryThisYear) {
    periodStart = anniversaryThisYear;
  } else {
    periodStart = clampDate(year - 1, openMonth, openDay);
  }

  // End is one year after start, minus one day
  const periodEnd = new Date(periodStart);
  periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  periodEnd.setDate(periodEnd.getDate() - 1);

  return { start: formatDate(periodStart), end: formatDate(periodEnd) };
};

export const getCurrentPeriodRange = (
  today: Date,
  input: PeriodInput,
): DateRange | null => {
  switch (input.resetType) {
    case "calendar":
      if (!input.resetConfig.period) return null;
      return getCalendarPeriodRange(today, input.resetConfig.period);

    case "subscription":
      return getCalendarPeriodRange(today, "monthly");

    case "anniversary": {
      if (!input.cardOpenDate) return null;
      return getAnniversaryRange(today, input.cardOpenDate);
    }

    case "since_last_use":
      return null;

    case "one_time":
      return null;
  }
};

const isDateInRange = (dateStr: string, range: DateRange): boolean => {
  return dateStr >= range.start && dateStr <= range.end;
};

export const isBenefitUsedInPeriod = (
  benefit: Benefit,
  today: Date,
  cardOpenDate?: string,
): boolean => {
  const { resetType, resetConfig, usageRecords } = benefit;

  if (resetType === "one_time") {
    return usageRecords.length > 0;
  }

  if (resetType === "since_last_use") {
    if (usageRecords.length === 0) return false;
    const cooldown = resetConfig.cooldownDays ?? 0;
    if (cooldown === 0) return false;
    const sorted = [...usageRecords].sort((a, b) => b.usedDate.localeCompare(a.usedDate));
    const lastUsed = new Date(sorted[0].usedDate + "T00:00:00");
    const cooldownEnd = new Date(lastUsed);
    cooldownEnd.setDate(cooldownEnd.getDate() + cooldown);
    return today < cooldownEnd;
  }

  // calendar, anniversary, subscription(autoRecur=false)
  const range = getCurrentPeriodRange(today, { resetType, resetConfig, cardOpenDate });
  if (!range) return false;
  return usageRecords.some((r) => isDateInRange(r.usedDate, range));
};

export const isApplicableNow = (benefit: Benefit, today: Date): boolean => {
  if (benefit.resetType === "one_time") {
    if (benefit.resetConfig.expiresDate) {
      return formatDate(today) <= benefit.resetConfig.expiresDate;
    }
    return true;
  }

  if (benefit.resetConfig.applicableMonths) {
    const currentMonth = today.getMonth() + 1;
    return benefit.resetConfig.applicableMonths.includes(currentMonth);
  }

  return true;
};

export interface DeadlineInput {
  resetType: ResetType;
  resetConfig: ResetConfig;
  cardOpenDate?: string;
  autoRecur?: boolean;
}

export const getDeadline = (today: Date, input: DeadlineInput): string | null => {
  if (input.resetType === "since_last_use") return null;

  if (input.resetType === "one_time") {
    return input.resetConfig.expiresDate ?? null;
  }

  const range = getCurrentPeriodRange(today, {
    resetType: input.resetType,
    resetConfig: input.resetConfig,
    cardOpenDate: input.cardOpenDate,
  });
  return range?.end ?? null;
};

const MS_PER_DAY = 86_400_000;

export const getDaysRemaining = (today: Date, deadline: string): number => {
  const deadlineDate = new Date(deadline + "T00:00:00");
  const todayStart = new Date(formatDate(today) + "T00:00:00");
  return Math.round((deadlineDate.getTime() - todayStart.getTime()) / MS_PER_DAY);
};
