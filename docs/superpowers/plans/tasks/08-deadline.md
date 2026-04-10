# Task 08: Deadline Computation

## Goal
Compute benefit deadlines and days remaining.

## Files
- Modify: `src/utils/period.ts`
- Modify: `src/utils/period.test.ts`

## Requirements

### `getDeadline(today, { resetType, resetConfig, cardOpenDate?, autoRecur? }) → string | null`

| Reset Type | Deadline |
|-----------|----------|
| since_last_use | `null` |
| subscription + autoRecur | `null` |
| one_time with expiresDate | The `expiresDate` value |
| one_time without expiresDate | `null` |
| All others | End date of `getCurrentPeriodRange` |

### `getDaysRemaining(today, deadline) → number`
- Simple date diff in days (positive = future, 0 = today, negative = past)

## Test Requirements
- Calendar: monthly, quarterly, semi-annual, annual deadlines
- Anniversary: day before next anniversary
- Subscription autoRecur on/off
- Since last use: null
- One-time with expiresDate: returns the date
- One-time without expiresDate: null
- getDaysRemaining: future, today, past
- ~10 tests minimum

## Acceptance Criteria
- [ ] All tests pass
- [ ] Lint clean
- [ ] Commit: `add deadline computation and days remaining calculation`
