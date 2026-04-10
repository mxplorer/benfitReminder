# Task 19: Card Detail

## Goal
Build the single-card detail view with benefits grid, filters, and usage history.

## Files
- Create: `src/views/main/CardDetail.tsx`, `src/views/main/CardDetail.css`, `src/views/main/CardDetail.test.tsx`

## Requirements

### Sections
1. **Card header**: Card visual (gradient + last 4 digits), display name, owner, annual fee, open date, renewal date, edit button
2. **ROI strip**: 4-cell grid — 年费 / 面值回报 / 实际回报 / 回本率
3. **Benefits grid**: 3-column layout with filter pills
4. **Usage history table**: Date, benefit name, face value / actual value

### Filter pills
- 全部 / 未使用 / 已使用 / 已隐藏
- Active filter pill highlighted
- Filter state is local

### Benefit card states
- Active/unused: full opacity, check button visible
- Used: dimmed (opacity 0.5), strikethrough name, shows actual value
- Hidden: very dim (opacity 0.35), eye icon, "取消隐藏" action
- "+ 添加 Benefit" dashed card at end of grid

### Data source
- `calculateCardROI(card, today)` for ROI strip
- `isBenefitUsedInPeriod`, `getDeadline`, `getDaysRemaining` for each benefit status

## Test Requirements
- Card header shows correct info
- Filter pills switch displayed benefits
- Used benefits have dimmed class
- Usage history renders records
- ~4 tests minimum

## Acceptance Criteria
- [ ] All tests pass
- [ ] Lint clean
- [ ] Commit: `add CardDetail with benefits grid, filters, and usage history`
