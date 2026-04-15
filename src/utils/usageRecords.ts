import type { Benefit, UsageRecord } from "../models/types";

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

/** True when the latest record opted into next-period propagation.
 *
 * Used to decide whether monthly-like benefits (subscriptions) keep
 * auto-generating. We intentionally read ONLY the latest record — a user
 * who opted in a month ago and opted out this month should stop
 * propagating forward. */
export const latestHasPropagate = (benefit: Benefit): boolean =>
  getLatestRecord(benefit.usageRecords)?.propagateNext === true;
