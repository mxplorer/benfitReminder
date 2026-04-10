# Task 18: Dashboard

## Goal
Build the ROI overview dashboard with period info, per-card recovery progress.

## Files
- Create: `src/views/main/Dashboard.tsx`, `src/views/main/Dashboard.css`, `src/views/main/Dashboard.test.tsx`

## Requirements

### Sections (top to bottom)
1. **Period info bar**: Pill badges showing current month, quarter (Q2), half-year (H1) — at-a-glance temporal context
2. **Year selector**: Pill buttons for available calendar years
3. **ROI summary**: 3-column GlassContainer grid — 总年费 / 面值回报 / 实际回报
4. **Per-card recovery rows**: Each card as row with CardChip, name, owner, renewal date, progress bar (actual/annualFee), ROI percentage. Not-recovered cards highlighted with red left border.

### Data source
- Use `calculateDashboardROI(cards, year)` for aggregate numbers
- Use `calculateCardROI(card, today)` for per-card rows
- Year selector determines which calendar year to display

## Test Requirements
- Period info bar shows current month/quarter/half
- ROI summary shows correct totals from mock data
- Not-recovered cards have red border class
- Year selector renders available years
- ~4 tests minimum

## Acceptance Criteria
- [ ] All tests pass
- [ ] Lint clean
- [ ] Commit: `add Dashboard with ROI overview and per-card recovery progress`
