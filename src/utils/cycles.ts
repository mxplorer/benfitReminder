import { getAnniversaryRange } from "./period";

export type YearScope = "calendar" | "anniversary";

export interface ScopeWindow {
  start: string; // ISO date, inclusive
  end: string; // ISO date, inclusive
}

export const getScopeWindow = (
  mode: YearScope,
  today: Date,
  cardOpenDate: string,
): ScopeWindow => {
  if (mode === "anniversary") {
    return getAnniversaryRange(today, cardOpenDate);
  }
  const year = today.getFullYear();
  const calendarStart = `${String(year)}-01-01`;
  const calendarEnd = `${String(year)}-12-31`;
  const start = cardOpenDate > calendarStart ? cardOpenDate : calendarStart;
  return { start, end: calendarEnd };
};
