# Task 09: ROI Calculation

## Goal
Calculate return-on-investment per card (membership year) and aggregate for dashboard (calendar year).

## Files
- Create: `src/utils/roi.ts`, `src/utils/roi.test.ts`

## Requirements

### `getMembershipYearRange(cardOpenDate, today, yearOffset?) → DateRange`
- Computes membership year range based on card open date anniversary
- yearOffset: 0 = current, -1 = previous, etc.

### `calculateCardROI(card, today, yearOffset?) → CardROI`
- Filter usageRecords within membership year range
- Sum `record.faceValue` (snapshot, not current benefit.faceValue) → `faceValueReturn`
- Sum `record.actualValue` → `actualReturn`
- `roiPercent = round(actualReturn / annualFee * 100)`
- `isRecovered = actualReturn >= annualFee`

### `calculateDashboardROI(cards, calendarYear) → DashboardROI`
- Aggregates across all enabled cards by calendar year (Jan 1 - Dec 31)
- Sums totalAnnualFee, totalFaceValue, totalActualValue
- Returns per-card breakdown as well

### Return types
- `CardROI`: `{ cardId, annualFee, faceValueReturn, actualReturn, roiPercent, isRecovered }`
- `DashboardROI`: `{ totalAnnualFee, totalFaceValue, totalActualValue, cards: CardROI[] }`

## Test Requirements
- getMembershipYearRange: after anniversary, before anniversary, with yearOffset
- calculateCardROI: filters records by membership year, uses snapshot faceValue not current, recovery threshold
- calculateDashboardROI: aggregates multiple cards, disabled cards excluded
- Zero-record edge case (annualFee > 0 but no records)
- ~8 tests minimum

## Acceptance Criteria
- [ ] All tests pass
- [ ] Lint clean
- [ ] Commit: `add ROI calculation for membership year and dashboard aggregation`

## Dev Docs
Create `docs/dev/modules/roi.md` — document membership year vs calendar year distinction, snapshot behavior.
