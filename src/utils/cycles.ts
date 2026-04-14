import { formatDate, getAnniversaryRange, getMonthRange, lastDay } from "./period";
import type { Benefit, UsageRecord } from "../models/types";

export type YearScope = "calendar" | "anniversary";

export interface ScopeWindow {
  start: string; // ISO date, inclusive
  end: string; // ISO date, inclusive
}

export interface PeriodCycle {
  start: string;
  end: string;
  label: string;
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

const overlaps = (cycleStart: string, cycleEnd: string, scope: ScopeWindow): boolean =>
  cycleEnd >= scope.start && cycleStart <= scope.end;

const passesOpenDate = (cycleEnd: string, cardOpenDate: string): boolean =>
  cycleEnd >= cardOpenDate;

const cyclesForMonthly = (scope: ScopeWindow, cardOpenDate: string): PeriodCycle[] => {
  const start = new Date(scope.start + "T00:00:00");
  const end = new Date(scope.end + "T00:00:00");
  const cycles: PeriodCycle[] = [];
  let y = start.getFullYear();
  let m = start.getMonth() + 1;
  while (y < end.getFullYear() || (y === end.getFullYear() && m <= end.getMonth() + 1)) {
    const r = getMonthRange(y, m);
    if (overlaps(r.start, r.end, scope) && passesOpenDate(r.end, cardOpenDate)) {
      cycles.push({ start: r.start, end: r.end, label: `${String(m)}月` });
    }
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return cycles;
};

const cyclesForQuarterly = (scope: ScopeWindow, cardOpenDate: string): PeriodCycle[] => {
  const startY = new Date(scope.start + "T00:00:00").getFullYear();
  const endY = new Date(scope.end + "T00:00:00").getFullYear();
  const cycles: PeriodCycle[] = [];
  for (let y = startY; y <= endY; y += 1) {
    for (let q = 1; q <= 4; q += 1) {
      const qStartMonth = (q - 1) * 3 + 1;
      const qEndMonth = qStartMonth + 2;
      const cs = `${String(y)}-${String(qStartMonth).padStart(2, "0")}-01`;
      const ce = `${String(y)}-${String(qEndMonth).padStart(2, "0")}-${String(lastDay(y, qEndMonth)).padStart(2, "0")}`;
      if (overlaps(cs, ce, scope) && passesOpenDate(ce, cardOpenDate)) {
        cycles.push({ start: cs, end: ce, label: `Q${String(q)} ${String(y)}` });
      }
    }
  }
  return cycles;
};

const cyclesForSemiAnnual = (scope: ScopeWindow, cardOpenDate: string): PeriodCycle[] => {
  const startY = new Date(scope.start + "T00:00:00").getFullYear();
  const endY = new Date(scope.end + "T00:00:00").getFullYear();
  const cycles: PeriodCycle[] = [];
  for (let y = startY; y <= endY; y += 1) {
    const halves: PeriodCycle[] = [
      { start: `${String(y)}-01-01`, end: `${String(y)}-06-30`, label: `H1 ${String(y)}` },
      { start: `${String(y)}-07-01`, end: `${String(y)}-12-31`, label: `H2 ${String(y)}` },
    ];
    for (const h of halves) {
      if (overlaps(h.start, h.end, scope) && passesOpenDate(h.end, cardOpenDate)) {
        cycles.push(h);
      }
    }
  }
  return cycles;
};

const cyclesForAnnual = (scope: ScopeWindow, cardOpenDate: string): PeriodCycle[] => {
  const startY = new Date(scope.start + "T00:00:00").getFullYear();
  const endY = new Date(scope.end + "T00:00:00").getFullYear();
  const cycles: PeriodCycle[] = [];
  for (let y = startY; y <= endY; y += 1) {
    const cs = `${String(y)}-01-01`;
    const ce = `${String(y)}-12-31`;
    if (overlaps(cs, ce, scope) && passesOpenDate(ce, cardOpenDate)) {
      cycles.push({ start: cs, end: ce, label: `${String(y)}年` });
    }
  }
  return cycles;
};

const cyclesForAnniversary = (scope: ScopeWindow, cardOpenDate: string): PeriodCycle[] => {
  const open = new Date(cardOpenDate + "T00:00:00");
  const scopeStart = new Date(scope.start + "T00:00:00");
  const scopeEnd = new Date(scope.end + "T00:00:00");
  const cycles: PeriodCycle[] = [];

  let anniv = new Date(scopeStart.getFullYear(), open.getMonth(), open.getDate());
  if (anniv > scopeStart) {
    anniv.setFullYear(anniv.getFullYear() - 1);
  }

  // scope spans at most a few years — bound loop defensively
  for (let i = 0; i < 100; i += 1) {
    const nextAnniv = new Date(anniv);
    nextAnniv.setFullYear(nextAnniv.getFullYear() + 1);
    const cs = formatDate(anniv);
    const ce = formatDate(new Date(nextAnniv.getTime() - 86400000));
    if (cs > scope.end) break;
    if (ce >= scope.start && ce >= cardOpenDate) {
      cycles.push({ start: cs, end: ce, label: `${String(anniv.getFullYear())}年度` });
    }
    anniv = nextAnniv;
    if (anniv > scopeEnd && cs > scope.end) break;
  }
  return cycles;
};

const cyclesForEvery4Years = (scope: ScopeWindow, cardOpenDate: string): PeriodCycle[] => {
  const startY = new Date(scope.start + "T00:00:00").getFullYear();
  const blockStart = startY - (startY % 4);
  const blockEnd = blockStart + 3;
  const cs = `${String(blockStart)}-01-01`;
  const ce = `${String(blockEnd)}-12-31`;
  if (ce >= cardOpenDate) {
    return [{ start: cs, end: ce, label: `${String(blockStart)}–${String(blockEnd)}` }];
  }
  return [];
};

const applicableMonthsOverlap = (
  cycle: PeriodCycle,
  applicableMonths: number[] | undefined,
): boolean => {
  if (!applicableMonths || applicableMonths.length === 0) return true;
  const start = new Date(cycle.start + "T00:00:00");
  const end = new Date(cycle.end + "T00:00:00");
  const months: number[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    months.push(cur.getMonth() + 1);
    cur.setMonth(cur.getMonth() + 1);
    cur.setDate(1);
  }
  return months.some((m) => applicableMonths.includes(m));
};

export const getScopeCycles = (
  benefit: Benefit,
  scope: ScopeWindow,
  cardOpenDate: string,
): PeriodCycle[] => {
  const { resetType, resetConfig } = benefit;
  let raw: PeriodCycle[] = [];
  if (resetType === "calendar" || resetType === "subscription") {
    const period = resetType === "subscription" ? "monthly" : resetConfig.period;
    switch (period) {
      case "monthly":
        raw = cyclesForMonthly(scope, cardOpenDate);
        break;
      case "quarterly":
        raw = cyclesForQuarterly(scope, cardOpenDate);
        break;
      case "semi_annual":
        raw = cyclesForSemiAnnual(scope, cardOpenDate);
        break;
      case "annual":
        raw = cyclesForAnnual(scope, cardOpenDate);
        break;
      case "every_4_years":
        raw = cyclesForEvery4Years(scope, cardOpenDate);
        break;
      default:
        raw = [];
    }
  } else if (resetType === "anniversary") {
    raw = cyclesForAnniversary(scope, cardOpenDate);
  }
  // one_time / since_last_use → []
  return raw.filter((c) => applicableMonthsOverlap(c, resetConfig.applicableMonths));
};

export const findCycleRecord = (
  benefit: Benefit,
  cycle: PeriodCycle,
): UsageRecord | undefined =>
  benefit.usageRecords.find(
    (r) => r.usedDate >= cycle.start && r.usedDate <= cycle.end,
  );
