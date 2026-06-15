/** Round a monetary amount to cents, eliminating IEEE-754 artifacts
 * (e.g. 9.99 - 2.69 = 7.300000000000001 → 7.3). Apply at the boundary
 * of any currency addition/subtraction before the value is stored or
 * displayed, so sums of face values never surface long decimal tails. */
export const roundMoney = (amount: number): number =>
  Math.round((amount + Number.EPSILON) * 100) / 100;

/** Format a monetary amount for display: round to cents (killing IEEE-754
 * tails like 13.700000000000045 → 13.7) and stringify with at most two
 * decimals and no forced trailing zeros (895 → "895", 12.95 → "12.95").
 * Use at every money render site instead of String(amount). */
export const formatMoney = (amount: number): string => String(roundMoney(amount));
