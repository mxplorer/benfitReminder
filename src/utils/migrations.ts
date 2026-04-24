import type { Benefit, CreditCard, UsageRecord, UsageRecordKind } from "../models/types";
import { cycleStartForDate } from "./usageRecords";
import { createLogger } from "../lib/logger";

const logger = createLogger("utils.migrations");

/**
 * Legacy benefit shape — `autoRecur` and `cancelledMonths` were removed from
 * the live `Benefit` interface, but disk data from older versions still carries
 * them. This migration is the sole reader that understands those fields.
 */
type LegacyBenefit = Benefit & { autoRecur?: boolean; cancelledMonths?: string[] };

/**
 * Legacy record shape — pre-`kind` data on disk still carries `isRollover`.
 * This type is the sole place that mentions it; after migration every record
 * in live memory has `kind` and no `isRollover` property.
 */
type LegacyRecord = Omit<UsageRecord, "kind"> & {
  isRollover?: boolean;
  kind?: UsageRecordKind;
};

/** Returns a shallow copy of obj without the given key. */
function omitKey<T extends object, K extends keyof T>(obj: T, key: K): Omit<T, K> {
  const result = { ...obj };
  // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
  delete result[key];
  return result;
}

/**
 * Converts legacy autoRecur=true + cancelledMonths pattern to per-record
 * propagateNext flags, then strips both legacy fields. Without this, old JSON
 * files would silently lose their "recurring subscription" intent after the
 * benefit-level flags were removed from the type.
 */
const migrateAutoRecur = (benefit: Benefit): Benefit => {
  const legacy = benefit as LegacyBenefit;
  if (!legacy.autoRecur) {
    // Drop an orphan cancelledMonths so stale JSON doesn't carry dead state forward.
    if (legacy.cancelledMonths === undefined) {
      return "autoRecur" in legacy ? (omitKey(legacy, "autoRecur") as Benefit) : benefit;
    }
    const stripped = omitKey(legacy, "cancelledMonths") as LegacyBenefit;
    return ("autoRecur" in stripped ? omitKey(stripped, "autoRecur") : stripped) as Benefit;
  }

  const cancelled = new Set(legacy.cancelledMonths ?? []);
  const isMonthlyLike =
    legacy.resetType === "subscription" ||
    (legacy.resetType === "calendar" && legacy.resetConfig.period === "monthly");

  const records = isMonthlyLike
    ? legacy.usageRecords.map((r) =>
        cancelled.has(r.usedDate.slice(0, 7)) || r.propagateNext !== undefined
          ? r
          : { ...r, propagateNext: true },
      )
    : legacy.usageRecords;

  const withoutCancelled = omitKey(legacy, "cancelledMonths") as LegacyBenefit;
  const withoutAutoRecur = omitKey(withoutCancelled, "autoRecur");
  return {
    ...withoutAutoRecur,
    usageRecords: records,
  } as Benefit;
};

/**
 * Tags every UsageRecord with `kind`, converting legacy `isRollover: true`
 * to `kind: "rollover"` (snapping `usedDate` to the containing cycle start,
 * deduplicating per cycle) and treating all other records as `kind: "usage"`.
 * Strips the legacy `isRollover` property from every record.
 * Idempotent: records that already carry `kind` are left alone.
 */
const migrateRolloverKind = (benefit: Benefit): Benefit => {
  const period = benefit.resetConfig.period;
  const seen = new Set<string>();
  const mapped: UsageRecord[] = [];

  for (const raw of benefit.usageRecords as LegacyRecord[]) {
    // Already tagged — keep, ensure no shadow isRollover leaks forward.
    if (raw.kind === "rollover" || raw.kind === "usage") {
      const cleaned = "isRollover" in raw ? omitKey(raw, "isRollover") : raw;
      if (cleaned.kind === "rollover") {
        const key = cleaned.usedDate;
        if (seen.has(key)) {
          logger.debug("dropping duplicate rollover record", { benefitId: benefit.id, usedDate: key });
          continue;
        }
        seen.add(key);
      }
      mapped.push(cleaned as UsageRecord);
      continue;
    }

    if (raw.isRollover === true) {
      let cycleStart = raw.usedDate;
      if (period) {
        cycleStart = cycleStartForDate(new Date(raw.usedDate + "T00:00:00"), period);
      } else {
        logger.warn("rollover record on non-calendar benefit; keeping usedDate as-is", {
          benefitId: benefit.id,
          usedDate: raw.usedDate,
          resetType: benefit.resetType,
        });
      }
      if (seen.has(cycleStart)) {
        logger.debug("dropping duplicate legacy rollover record", { benefitId: benefit.id, cycleStart });
        continue;
      }
      seen.add(cycleStart);
      // Legacy rollover records predate partial-amount tracking and
      // represented a fully-rolled cycle. Seed faceValue with benefit.faceValue
      // so the new math (sum record.faceValue per cycle) produces the same
      // total the old "1 record = benefit.faceValue" math produced.
      mapped.push({
        usedDate: cycleStart,
        faceValue: benefit.faceValue,
        actualValue: 0,
        kind: "rollover",
      });
      continue;
    }

    // Legacy usage record (isRollover was false or undefined).
    const stripped = "isRollover" in raw ? (omitKey(raw, "isRollover") as UsageRecord) : (raw as UsageRecord);
    mapped.push({ ...stripped, kind: "usage" });
  }

  return { ...benefit, usageRecords: mapped };
};

/**
 * Seeds faceValue on legacy rollover records (faceValue=0) to benefit.faceValue
 * so they behave as "fully rolled" under the new per-cycle amount model. Only
 * touches records with kind="rollover" AND faceValue===0; leaves records that
 * already carry an amount (from the new write path) untouched. Idempotent.
 *
 * This exists because two write paths historically produced faceValue=0:
 *   1. the original factory (before partial-amount support)
 *   2. the legacy isRollover→kind migration (now seeds benefit.faceValue on
 *      the first pass, but pre-existing post-migration data on disk still
 *      has zeros)
 * Running this step after both migrations ensures every live record has a
 * meaningful amount regardless of how/when it was written.
 */
const backfillRolloverFaceValue = (benefit: Benefit): Benefit => {
  if (benefit.faceValue <= 0) return benefit;
  const needsBackfill = benefit.usageRecords.some(
    (r) => r.kind === "rollover" && r.faceValue === 0,
  );
  if (!needsBackfill) return benefit;
  const records = benefit.usageRecords.map((r) =>
    r.kind === "rollover" && r.faceValue === 0
      ? { ...r, faceValue: benefit.faceValue }
      : r,
  );
  return { ...benefit, usageRecords: records };
};

/**
 * Patches existing user cards for template changes that shipped after cards
 * were already created. Idempotent — safe to run on every load.
 */
export const migrateCards = (cards: CreditCard[]): CreditCard[] => {
  return cards.map((card) => ({
    ...card,
    benefits: card.benefits.map((benefit) => {
      let next = benefit;

      // Marriott Boundless H2 2026 airline credit: ship `availableFromDate`
      // so it hides from "available" until 2026-07-01.
      if (
        next.resetType === "one_time" &&
        next.name === "$50 Airline Credit (H2 2026)" &&
        !next.resetConfig.availableFromDate
      ) {
        next = {
          ...next,
          resetConfig: {
            ...next.resetConfig,
            availableFromDate: "2026-07-01",
          },
        };
      }

      // autoRecur + cancelledMonths → per-record propagateNext
      next = migrateAutoRecur(next);

      // isRollover → kind (seeds faceValue=benefit.faceValue for legacy)
      next = migrateRolloverKind(next);

      // Any remaining kind="rollover" w/ faceValue=0 → seed benefit.faceValue
      next = backfillRolloverFaceValue(next);

      return next;
    }),
  }));
};
