# Task 06: Period Calculation — Current Period Ranges

## Goal
Implement `getCurrentPeriodRange`: given a date and reset type, compute the current period's start/end dates.

## Files
- Create: `src/utils/period.ts`, `src/utils/period.test.ts`

## Requirements

### `getCurrentPeriodRange(today, { resetType, resetConfig, cardOpenDate? }) → DateRange | null`

| Reset Type | Behavior |
|-----------|----------|
| calendar monthly | First to last day of month |
| calendar quarterly | Q1=Jan-Mar, Q2=Apr-Jun, Q3=Jul-Sep, Q4=Oct-Dec |
| calendar semi_annual | H1=Jan-Jun, H2=Jul-Dec |
| calendar annual | Jan 1 - Dec 31 |
| calendar every_4_years | 4-year blocks aligned to `year % 4 == 0` |
| anniversary | Membership year from cardOpenDate anniversary to next anniversary minus 1 day |
| subscription | Same as calendar monthly |
| since_last_use | Returns `null` (no period concept) |
| one_time | Returns `null` (no period concept) |

### Helper types to export
- `DateRange = { start: string; end: string }` (ISO dates)
- Internal helpers: `formatDate`, `lastDay`, `getMonthRange`, `getCalendarPeriodRange`, `getAnniversaryRange`

## Test Requirements
Cover every reset type with boundary cases:
- Monthly: mid-month, 31-day month, Feb leap year
- Quarterly: Q1, Q2, Q4
- Semi-annual: H1, H2
- Annual: full year
- Every 4 years: correct block alignment
- Anniversary: after open date, before open date, on open date exactly
- Subscription: returns monthly range
- Since last use: returns null
- One-time: returns null (with and without expiresDate)
- ~15 tests minimum

## Acceptance Criteria
- [ ] All tests pass
- [ ] Pure function, no side effects
- [ ] Lint clean
- [ ] Commit: `add period range calculation for all reset types`

## Dev Docs
Create `docs/dev/modules/period.md` — document the period model, DateRange type, how each reset type maps to a range.
