import type { Benefit, CreditCard } from "../models/types";

/**
 * Legacy benefit shape — `autoRecur` and `cancelledMonths` were removed from
 * the live `Benefit` interface, but disk data from older versions still carries
 * them. This migration is the sole reader that understands those fields.
 */
type LegacyBenefit = Benefit & { autoRecur?: boolean; cancelledMonths?: string[] };

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

      return next;
    }),
  }));
};
