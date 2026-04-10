# Task 16: Tray Panel Views — ByCard + ByUrgency

## Goal
Implement the two view modes for the tray panel.

## Files
- Create: `src/views/tray/ByCardView.tsx`, `src/views/tray/ByCardView.test.tsx`
- Create: `src/views/tray/ByUrgencyView.tsx`, `src/views/tray/ByUrgencyView.test.tsx`

## Requirements

### ByCardView
- Group benefits by card
- Each group: CardChip + card display name + unused count badge
- Benefits as 2-column grid of compact BenefitCard
- Only show enabled cards with visible (non-hidden) benefits
- Used benefits shown dimmed, unused show check button

### ByUrgencyView
- Flat list of ALL unused, non-hidden benefits across enabled cards
- Sorted by `daysRemaining` ascending (most urgent first)
- Each item shows source card chip + compact BenefitCard
- Expired one_time benefits excluded (isApplicableNow = false)

### Both views
- Use `isBenefitUsedInPeriod`, `getDeadline`, `getDaysRemaining`, `isApplicableNow` from period utils
- Click check button calls `store.toggleBenefitUsage`

## Test Requirements
- ByCardView: benefits grouped under correct card headers, used benefits dimmed, click check calls store
- ByUrgencyView: sorted by urgency, shows card source, most urgent first
- ~6 tests minimum

## Acceptance Criteria
- [ ] All tests pass
- [ ] Lint clean
- [ ] Commit: `add ByCardView and ByUrgencyView for tray panel`
