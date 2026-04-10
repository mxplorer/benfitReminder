# ROI Module

## Overview

Pure functions for calculating return-on-investment per card and across the dashboard. No side effects — takes card data and dates as input, returns computed values.

## Functions

| Function | Purpose |
|----------|---------|
| `getMembershipYearRange(cardOpenDate, today, yearOffset?)` | Date range from card anniversary to next anniversary - 1 day |
| `calculateCardROI(card, today, yearOffset?)` | Sum usage records within membership year → fee/return/percent |
| `calculateDashboardROI(cards, calendarYear)` | Sum across all enabled cards within a calendar year (Jan 1 – Dec 31) |

## CardROI Shape

```ts
{
  cardId: string;
  annualFee: number;
  faceValueReturn: number;   // sum of usageRecord.faceValue in range
  actualReturn: number;      // sum of usageRecord.actualValue in range
  roiPercent: number;        // Math.round((actualReturn / annualFee) * 100), 0 if fee=0
  isRecovered: boolean;      // actualReturn >= annualFee
}
```

## Membership Year vs Calendar Year

- **Membership year** (used by `calculateCardROI`): anniversary-to-anniversary. E.g., card opened March 15 → year runs Mar 15 to Mar 14 next year. The `yearOffset` param shifts this: 0 = current, -1 = previous.
- **Calendar year** (used by `calculateDashboardROI`): Jan 1 – Dec 31. Used for the dashboard's cross-card aggregate view.

## Design Decision: faceValue Snapshot

When a benefit is checked off, `usageRecord.faceValue` captures the benefit's face value at that moment. If the user later changes the benefit's face value, historical records keep their original snapshot. This prevents retroactive ROI distortion.
