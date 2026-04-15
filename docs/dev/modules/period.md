# Period Module

## Overview

Pure functions for computing benefit period ranges, usage status, applicability, and deadlines. No side effects — all state is passed in as arguments.

## Key Types

```ts
DateRange = { start: string; end: string }  // ISO date strings
PeriodInput = { resetType, resetConfig, cardOpenDate? }
DeadlineInput = { resetType, resetConfig, cardOpenDate? }
```

## Functions

| Function | Purpose |
|----------|---------|
| `getCurrentPeriodRange(today, input)` | Current period start/end for a reset type |
| `isBenefitUsedInPeriod(benefit, today, cardOpenDate?)` | Whether benefit is used in current period |
| `isApplicableNow(benefit, today)` | Whether benefit is active (month filter, expiry) |
| `getDeadline(today, input)` | Period end date or expiry date |
| `getDaysRemaining(today, deadline)` | Day count to deadline |

## Period Model by Reset Type

| Reset Type | Period Range | Used Check | Deadline |
|-----------|-------------|-----------|---------|
| calendar monthly | 1st–last of month | Record in range | End of month |
| calendar quarterly | Q1-Q4 boundaries | Record in range | End of quarter |
| calendar semi_annual | H1 (Jan-Jun) / H2 (Jul-Dec) | Record in range | Jun 30 / Dec 31 |
| calendar annual | Jan 1 – Dec 31 | Record in range | Dec 31 |
| calendar every_4_years | 4-year blocks (year % 4 == 0) | Record in range | End of block |
| anniversary | cardOpenDate anniversary to next - 1 day | Record in range | Day before next anniversary |
| subscription | Monthly | Record in range | End of month (propagation of prior month's record is handled separately in the store) |
| since_last_use | null (no period) | Cooldown check | null |
| one_time | null (no period) | Any record exists | expiresDate or null |

## Composing Checks

Callers should combine `isApplicableNow` (month/expiry filter) with `isBenefitUsedInPeriod` (usage status) to determine whether a benefit needs attention. Neither function alone gives the full picture — a one_time benefit may be applicable but already used, or an H1-only benefit may be unused but not applicable in H2.
