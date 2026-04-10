# Task 14: Shared Components

## Goal
Build reusable UI components used by both tray panel and main window.

## Files
- Create: `src/views/shared/GlassContainer.tsx`
- Create: `src/views/shared/CardChip.tsx`
- Create: `src/views/shared/StatusTag.tsx`, `src/views/shared/StatusTag.test.tsx`
- Create: `src/views/shared/BenefitCard.tsx`, `src/views/shared/BenefitCard.test.tsx`

## Requirements

### GlassContainer
Simple wrapper applying `.glass-panel` or `.glass-card` class. Props: `className?`, `children`, `variant?: "panel" | "card"`.

### CardChip
Mini credit card visual with gradient background from card color. Props: `color: string`, `size?: "small" | "normal"`.

### StatusTag
Pill badge with color based on status. Props: `daysRemaining: number | null`, `isUsed: boolean`, `usedDate?: string`.

Display logic:
- Used → green "已使用"
- daysRemaining ≤ 7 → red "剩 N 天"
- daysRemaining ≤ 30 → orange "剩 N 天"
- daysRemaining > 30 → green "剩 N 天"
- null (since_last_use / autoRecur / one_time no deadline) → green "可用"

### BenefitCard
Combines GlassContainer + StatusTag. Props: `benefit: Benefit`, `card: CreditCard`, `onToggleUsage`, `compact?: boolean`.
Shows: status tag, period label, name, description (truncated if compact), face value, check button.

## Test Requirements
- StatusTag: all 5 urgency thresholds produce correct text and CSS class
- BenefitCard: click handler fires with correct cardId + benefitId
- ~7 tests minimum

## Acceptance Criteria
- [ ] All tests pass
- [ ] Components render without errors
- [ ] Lint clean
- [ ] Commit: `add shared components: GlassContainer, CardChip, StatusTag, BenefitCard`
