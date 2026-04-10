# Task 24: System Notifications

## Goal
Send macOS system notifications for benefits approaching deadlines.

## Files
- Create: `src/tauri/notifications.ts`
- Modify: `src/App.tsx` or top-level component — trigger on mount + focus

## Requirements

### `checkAndSendReminders(cards, today, reminderDays)`
1. Check/request notification permission via Tauri notification plugin
2. Get reminder items from `getBenefitsDueForReminder`
3. Send notification for each item:
   - Title: `"{benefit.name} 即将到期"`
   - Body: `"{cardDisplayName} · 剩余 {N} 天 · 面值 ${faceValue}"`
4. Log `metrics.count("notification.sent")` per notification

### Trigger points
- App launch (after store hydration)
- Window focus event
- Do NOT trigger if `settings.dismissedDate === today`

## Acceptance Criteria
- [ ] Notifications appear on macOS when benefits are within reminder window
- [ ] Respects dismissedDate
- [ ] Commit: `add system notification reminders for approaching deadlines`
