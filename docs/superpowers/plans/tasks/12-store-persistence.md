# Task 12: Zustand Store — Persistence Layer

## Goal
Add data export/import and subscription auto-recur record generation.

## Files
- Modify: `src/stores/useCardStore.ts`
- Modify: `src/stores/useCardStore.test.ts`

## Requirements

### New actions
| Action | Behavior |
|--------|----------|
| `exportData()` | Returns `JSON.stringify({ version: 1, cards, settings })` |
| `importData(json)` | Parse JSON, validate version field + cards array, replace state. Invalid JSON → throw, state unchanged |
| `generateAutoRecurRecords()` | For subscription benefits with autoRecur=true: if current month has no record, create one with `actualValue = faceValue` |

### Validation for importData
- Must have `version` field (number)
- Must have `cards` array
- On validation failure: throw descriptive error, do NOT modify state
- On success: replace entire state with imported data
- Log `metrics.count("data.imported")` on success

### Auto-recur generation
- Iterate all cards → benefits where `resetType === "subscription" && autoRecur === true`
- Check if current month already has a UsageRecord
- If not: add `{ usedDate: 1st of current month, faceValue: benefit.faceValue, actualValue: benefit.faceValue }`
- Mark auto-generated records for display purposes

### Round-trip integrity
- `exportData` → `importData` → state must be deep-equal to original

## Test Requirements
- exportData returns valid JSON string
- importData with valid JSON replaces state
- importData with invalid JSON throws, state unchanged
- JSON round-trip: save → load → deep equal
- generateAutoRecurRecords creates records for current month
- ~6 tests minimum

## Acceptance Criteria
- [ ] All tests pass
- [ ] Lint clean
- [ ] Commit: `add data export/import and subscription auto-recur record generation`
