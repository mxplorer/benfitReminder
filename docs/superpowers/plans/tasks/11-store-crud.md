# Task 11: Zustand Store — Card and Benefit CRUD

## Goal
Create the central Zustand store with all card/benefit mutation actions.

## Files
- Create: `src/stores/useCardStore.ts`, `src/stores/useCardStore.test.ts`

## Requirements

### State
- `cards: CreditCard[]`
- `settings: AppSettings` (with defaults: reminderEnabled=true, reminderDays=3, logLevel="info", debugLogEnabled=false)

### Actions
| Action | Behavior |
|--------|----------|
| `addCard(card)` | Add a CreditCard to state |
| `removeCard(cardId)` | Remove card by id |
| `updateCard(cardId, partial)` | Merge partial updates into existing card |
| `toggleCardEnabled(cardId)` | Flip `isEnabled` |
| `addBenefit(cardId, benefit)` | Add benefit to specific card |
| `removeBenefit(cardId, benefitId)` | Remove benefit from card |
| `toggleBenefitHidden(cardId, benefitId)` | Flip `isHidden` |
| `toggleBenefitAutoRecur(cardId, benefitId)` | Flip `autoRecur` |
| `toggleBenefitUsage(cardId, benefitId, actualValue?)` | If used in current period → remove most recent record; if not → add UsageRecord with faceValue snapshot |
| `getUnusedBenefitCount()` | Count of non-hidden, non-autoRecur, unused benefits across enabled cards |

### Key behavior: `toggleBenefitUsage`
- Uses `isBenefitUsedInPeriod` to check current state
- New record: `{ usedDate: today, faceValue: benefit.faceValue, actualValue: actualValue ?? benefit.faceValue }`
- For one_time benefits: toggle on adds record, toggle off removes it (since there's no period, just checks if any record exists)
- Use `structuredClone` for immutable updates
- Log with `metrics.count("benefit.checked_off")` on check-off

## Test Requirements
- Each action: verify state before and after
- toggleBenefitUsage: creates record with correct faceValue snapshot, removes on re-toggle
- getUnusedBenefitCount: excludes hidden and autoRecur
- ~10 tests minimum

## Acceptance Criteria
- [ ] All tests pass
- [ ] Lint clean
- [ ] Commit: `add Zustand store with card and benefit CRUD operations`

## Dev Docs
Create `docs/dev/modules/store.md` — document store shape, action semantics, immutability approach.
