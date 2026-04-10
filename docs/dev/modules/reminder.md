# Reminder Module

## Overview

Single pure function that filters benefits approaching their deadlines. Used by the notification system to decide what to alert the user about.

## Function

```ts
getBenefitsDueForReminder(cards, today, reminderDays) → ReminderItem[]
```

### Filter Chain

A benefit appears in the result only if ALL conditions are true:
1. Card is enabled
2. Benefit is not hidden
3. Not an auto-recur subscription (those are tracked automatically)
4. `isApplicableNow` (passes month filter and hasn't expired)
5. Not already used in current period
6. Has a deadline (some types like `since_last_use` don't)
7. `daysRemaining` is between 0 and `reminderDays` (inclusive)

### Output

```ts
ReminderItem = {
  card: CreditCard;
  benefit: Benefit;
  deadline: string;       // ISO date
  daysRemaining: number;  // 0 = expires today
}
```

Sorted by `daysRemaining` ascending (most urgent first).

## Integration Points

- `src/tauri/notifications.ts` calls this to decide what system notifications to send
- The tray `ByUrgencyView` uses similar logic (via period utils directly) but without the `reminderDays` threshold
