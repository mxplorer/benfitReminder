import type { Benefit } from "../models/types";

/** Returns YYYY-MM key for a given date. */
export const formatMonthKey = (d: Date): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${String(year)}-${month}`;
};

/**
 * Resolves the actualValue to use when auto-inserting a new subscription record.
 * Returns the most-recent-by-usedDate record's actualValue, or the benefit's
 * faceValue if no records exist.
 */
export const resolveAutoRecurValue = (benefit: Benefit): number => {
  if (benefit.usageRecords.length === 0) return benefit.faceValue;
  const sorted = [...benefit.usageRecords].sort((a, b) =>
    b.usedDate.localeCompare(a.usedDate),
  );
  return sorted[0].actualValue;
};
