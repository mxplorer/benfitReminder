import type { CreditCard } from "../models/types";
import type { DateRange } from "./period";
import { formatDate, lastDay } from "./period";

// Clamp day to last day of target month (handles Feb 29 in non-leap years)
const clampDate = (year: number, month: number, day: number): Date => {
  const maxDay = lastDay(year, month + 1);
  return new Date(year, month, Math.min(day, maxDay));
};

export interface CardROI {
  cardId: string;
  annualFee: number;
  faceValueReturn: number;
  actualReturn: number;
  roiPercent: number;
  isRecovered: boolean;
}

export interface DashboardROI {
  totalAnnualFee: number;
  totalFaceValue: number;
  totalActualValue: number;
  cards: CardROI[];
}

export const getMembershipYearRange = (
  cardOpenDate: string,
  today: Date,
  yearOffset = 0,
): DateRange => {
  const open = new Date(cardOpenDate + "T00:00:00");
  const openMonth = open.getMonth();
  const openDay = open.getDate();
  const year = today.getFullYear();

  const anniversaryThisYear = clampDate(year, openMonth, openDay);
  let periodStartYear: number;

  if (today >= anniversaryThisYear) {
    periodStartYear = year;
  } else {
    periodStartYear = year - 1;
  }

  periodStartYear += yearOffset;

  const start = clampDate(periodStartYear, openMonth, openDay);
  const end = new Date(start);
  end.setFullYear(end.getFullYear() + 1);
  end.setDate(end.getDate() - 1);

  return { start: formatDate(start), end: formatDate(end) };
};

const sumRecordsInRange = (
  card: CreditCard,
  range: DateRange,
): { faceValueReturn: number; actualReturn: number } => {
  let faceValueReturn = 0;
  let actualReturn = 0;

  for (const benefit of card.benefits) {
    for (const record of benefit.usageRecords) {
      if (record.kind === "rollover") continue;
      if (record.usedDate >= range.start && record.usedDate <= range.end) {
        faceValueReturn += record.faceValue;
        actualReturn += record.actualValue;
      }
    }
  }

  return { faceValueReturn, actualReturn };
};

export const calculateCardROI = (
  card: CreditCard,
  today: Date,
  yearOffset = 0,
  rangeOverride?: DateRange,
): CardROI => {
  const range = rangeOverride ?? getMembershipYearRange(card.cardOpenDate, today, yearOffset);
  const { faceValueReturn, actualReturn } = sumRecordsInRange(card, range);

  const roiPercent = card.annualFee > 0 ? Math.round((actualReturn / card.annualFee) * 100) : 0;

  return {
    cardId: card.id,
    annualFee: card.annualFee,
    faceValueReturn,
    actualReturn,
    roiPercent,
    isRecovered: actualReturn >= card.annualFee,
  };
};

export const calculateDashboardROI = (
  cards: CreditCard[],
  calendarYear: number,
): DashboardROI => {
  const range: DateRange = {
    start: `${String(calendarYear)}-01-01`,
    end: `${String(calendarYear)}-12-31`,
  };

  const enabledCards = cards.filter((c) => c.isEnabled);
  const cardROIs: CardROI[] = [];

  let totalAnnualFee = 0;
  let totalFaceValue = 0;
  let totalActualValue = 0;

  for (const card of enabledCards) {
    const { faceValueReturn, actualReturn } = sumRecordsInRange(card, range);
    const roiPercent =
      card.annualFee > 0 ? Math.round((actualReturn / card.annualFee) * 100) : 0;

    cardROIs.push({
      cardId: card.id,
      annualFee: card.annualFee,
      faceValueReturn,
      actualReturn,
      roiPercent,
      isRecovered: actualReturn >= card.annualFee,
    });

    totalAnnualFee += card.annualFee;
    totalFaceValue += faceValueReturn;
    totalActualValue += actualReturn;
  }

  return { totalAnnualFee, totalFaceValue, totalActualValue, cards: cardROIs };
};
