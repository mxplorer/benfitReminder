# Task 07: Period Calculation — isBenefitUsed + isApplicable

## Goal
Determine if a benefit is used in the current period and if it's currently applicable.

## Files
- Modify: `src/utils/period.ts`
- Modify: `src/utils/period.test.ts`

## Requirements

### `isBenefitUsedInPeriod(benefit, today, cardOpenDate?) → boolean`

| Reset Type | Logic |
|-----------|-------|
| one_time | `usageRecords.length > 0` (any record = permanently used) |
| subscription + autoRecur | Always true |
| since_last_use | Most recent usedDate + cooldownDays > today; cooldown=0 means always available |
| calendar/anniversary/subscription(autoRecur=false) | Any usageRecord.usedDate falls within `getCurrentPeriodRange` |

### `isApplicableNow(benefit, today) → boolean`
- one_time with expiresDate: false if `today > expiresDate`
- one_time without expiresDate: always true
- If `applicableMonths` set: current month must be in the list
- Otherwise: always true

## Test Requirements
- Calendar monthly: used in period, not used (prior month)
- Subscription autoRecur=true: always used
- Subscription autoRecur=false: behaves like monthly
- Since last use: within cooldown, cooldown expired, cooldown=0
- Anniversary: used within membership year
- One-time: used (has records), not used (no records), used long ago (still counts)
- isApplicableNow: no applicableMonths, month in list, month not in list, one_time before/after expiry, one_time no expiry
- ~15 tests minimum

## Acceptance Criteria
- [ ] All tests pass
- [ ] Lint clean
- [ ] Commit: `add isBenefitUsedInPeriod and isApplicableNow functions`
