# Store Module

## Overview

Central Zustand store (`useCardStore`) managing all card/benefit state and mutations. Single store, no middleware. Persistence handled externally via `tauri/persistence.ts`.

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
| `updateCard(cardId, partial)` | Merge partial fields (also used for updating benefits array) |
| `toggleCardEnabled(cardId)` | Flip `isEnabled` |
| `addBenefit(cardId, benefit)` | Add benefit to card |
| `removeBenefit(cardId, benefitId)` | Remove benefit |
| `toggleBenefitHidden(cardId, benefitId)` | Flip `isHidden` |
| `toggleBenefitUsage(cardId, benefitId, actualValue?)` | Toggle usage record for current period |
| `getUnusedBenefitCount()` | Count actionable unused benefits (derived, not state) |
| `updateSettings(partial)` | Merge settings |
| `loadData(cards, settings)` | Replace entire state |
| `exportData()` | Serialize `{ version, cards, settings }` to JSON string |
| `importData(json)` | Parse JSON, validate structure, replace state. Throws on invalid input. |
| `generateAutoRecurRecords()` | For monthly subscription / calendar-monthly benefits: when the previous month's record has `propagateNext: true`, auto-create a record for the current month carrying forward its `actualValue`. Reads the per-record flag on the latest prior-month `UsageRecord`; there is no benefit-level autoRecur flag. |

## toggleBenefitUsage Semantics

- Checks `isBenefitUsedInPeriod` to determine current state
- **Check off**: creates `UsageRecord` with `faceValue` snapshot from benefit (not editable later)
- **Undo**: removes the most recent record via `pop()`
- `actualValue` defaults to `faceValue` if not provided

## getUnusedBenefitCount Logic

Counts benefits where ALL are true:
1. Card `isEnabled`
2. Benefit not `isHidden`
3. `isApplicableNow(benefit, today)` — passes month filter and hasn't expired
4. Not `isBenefitUsedInPeriod` — no record in current period (for monthly subs, `propagateNext` on the prior record now drives replication, not a skip)

## Export/Import Format

```json
{
  "version": 1,
  "cards": [...],
  "settings": { "logLevel", "debugLogEnabled", "reminderEnabled", "reminderDays", "dismissedDate" }
}
```

`importData` validates: must be object, must have numeric `version`, must have `cards` array. Missing `settings` falls back to defaults.

## Immutability

All mutations use spread/map to produce new objects. `updateBenefitInCards` helper maps over cards → map over benefits → apply updater to matched benefit.

## Persistence Integration

The store itself has no persistence logic. `tauri/persistence.ts` subscribes to changes and handles file I/O externally. This keeps the store testable without mocking Tauri APIs.
