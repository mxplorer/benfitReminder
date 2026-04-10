# Task 10: Reminder Logic

## Goal
Filter benefits that need reminders based on approaching deadlines.

## Files
- Create: `src/utils/reminder.ts`, `src/utils/reminder.test.ts`

## Requirements

### `getBenefitsDueForReminder(cards, today, reminderDays) → ReminderItem[]`

Returns benefits where deadline is within `reminderDays` window and `daysRemaining >= 0`.

**Exclusion rules** (apply in order):
1. Skip disabled cards (`isEnabled === false`)
2. Skip hidden benefits (`isHidden === true`)
3. Skip subscription with autoRecur=true
4. Skip benefits not applicable now (`isApplicableNow` returns false, including expired one_time)
5. Skip already-used benefits (`isBenefitUsedInPeriod` returns true)
6. Skip benefits with no deadline (`getDeadline` returns null)

### `ReminderItem` type
`{ card: CreditCard, benefit: Benefit, deadline: string, daysRemaining: number }`

Sort by `daysRemaining` ascending (most urgent first).

## Test Requirements
- Returns benefits within reminder window
- Excludes: hidden, autoRecur=true, already used, not applicable this month, disabled cards
- One-time benefit approaching expiresDate: included
- One-time benefit already used: excluded
- Expired one-time benefit: excluded
- ~9 tests minimum

## Acceptance Criteria
- [ ] All tests pass
- [ ] Full test suite (`npm run test`) still green
- [ ] Lint clean
- [ ] Commit: `add reminder logic with filtering for hidden, autoRecur, and applicability`
