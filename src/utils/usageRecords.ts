import type { Benefit, CalendarPeriod, UsageRecord } from "../models/types";

/** Returns the most recently used record (by usedDate desc), or undefined
 * when the benefit has no usage history.
 *
 * Sorting is done on a shallow copy so callers can pass immutable/store-owned
 * arrays without risking accidental mutation. */
export const getLatestRecord = (
  records: UsageRecord[],
): UsageRecord | undefined => {
  if (records.length === 0) return undefined;
  return [...records].sort((a, b) => b.usedDate.localeCompare(a.usedDate))[0];
};

export interface MakeUsageRecordInput {
  usedDate: string;
  faceValue: number;
  actualValue: number;
  propagateNext?: boolean;
}

/** Factory for "usage" records. Keeps `kind` centralised so callers don't
 * have to remember to tag every literal. */
export const makeUsageRecord = (input: MakeUsageRecordInput): UsageRecord => ({
  usedDate: input.usedDate,
  faceValue: input.faceValue,
  actualValue: input.actualValue,
  kind: "usage",
  ...(input.propagateNext !== undefined ? { propagateNext: input.propagateNext } : {}),
});

/** Factory for "rollover" records. Enforces the two invariants (face/actual
 * zero, usedDate = cycle start) at the only write site so readers can trust
 * them without re-validating. */
export const makeRolloverRecord = (cycleStart: string): UsageRecord => ({
  usedDate: cycleStart,
  faceValue: 0,
  actualValue: 0,
  kind: "rollover",
});

/** Convenience helper: the first of the calendar period containing `date`,
 * in ISO form, suitable as input to `makeRolloverRecord`. */
export const cycleStartForDate = (date: Date, period: CalendarPeriod): string => {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const pad = (n: number) => String(n).padStart(2, "0");
  switch (period) {
    case "monthly":
      return `${String(year)}-${pad(month)}-01`;
    case "quarterly": {
      const qStart = Math.floor((month - 1) / 3) * 3 + 1;
      return `${String(year)}-${pad(qStart)}-01`;
    }
    case "semi_annual":
      return month <= 6 ? `${String(year)}-01-01` : `${String(year)}-07-01`;
    case "annual":
      return `${String(year)}-01-01`;
    case "every_4_years": {
      const blockStart = year - (year % 4);
      return `${String(blockStart)}-01-01`;
    }
  }
};

/** True when the latest record opted into next-period propagation.
 *
 * Used to decide whether monthly-like benefits (subscriptions) keep
 * auto-generating. We intentionally read ONLY the latest record — a user
 * who opted in a month ago and opted out this month should stop
 * propagating forward. */
export const latestHasPropagate = (benefit: Benefit): boolean =>
  getLatestRecord(benefit.usageRecords)?.propagateNext === true;
