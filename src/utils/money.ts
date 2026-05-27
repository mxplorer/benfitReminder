/** Round a monetary amount to cents, eliminating IEEE-754 artifacts
 * (e.g. 9.99 - 2.69 = 7.300000000000001 → 7.3). Apply at the boundary
 * of any currency addition/subtraction before the value is stored or
 * displayed, so sums of face values never surface long decimal tails. */
export const roundMoney = (amount: number): number =>
  Math.round((amount + Number.EPSILON) * 100) / 100;
