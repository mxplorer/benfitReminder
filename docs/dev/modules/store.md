# Store Module

## Overview

Central Zustand store (`useCardStore`) managing all card/benefit state and mutations.

## State Shape

```ts
{
  cards: CreditCard[],
  settings: AppSettings
}
```

## Actions

| Action | Effect |
|--------|--------|
| `addCard(card)` | Append card to list |
| `removeCard(cardId)` | Remove by id |
| `updateCard(cardId, partial)` | Merge partial fields |
| `toggleCardEnabled(cardId)` | Flip `isEnabled` |
| `addBenefit(cardId, benefit)` | Add benefit to card |
| `removeBenefit(cardId, benefitId)` | Remove benefit |
| `toggleBenefitHidden(cardId, benefitId)` | Flip `isHidden` |
| `toggleBenefitAutoRecur(cardId, benefitId)` | Flip `autoRecur` |
| `toggleBenefitUsage(cardId, benefitId, actualValue?)` | Toggle usage record for current period |
| `getUnusedBenefitCount()` | Count actionable unused benefits |
| `updateSettings(partial)` | Merge settings |
| `loadData(cards, settings)` | Replace entire state (for file load / import) |

## toggleBenefitUsage Semantics

- Checks `isBenefitUsedInPeriod` to determine current state
- **Check off**: creates `UsageRecord` with `faceValue` snapshot from benefit (not editable later)
- **Undo**: removes the most recent record via `pop()`
- `actualValue` defaults to `faceValue` if not provided

## Immutability

All mutations use spread/map to produce new objects. No in-place mutation of state.
