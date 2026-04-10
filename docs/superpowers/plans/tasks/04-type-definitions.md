# Task 04: Type Definitions

## Goal
Define all TypeScript types for the data model and the `getCardDisplayName` helper.

## Files
- Create: `src/models/types.ts`, `src/models/types.test.ts`

## Requirements

### Types to define (see spec Data Model section for full details)
- Template types: `BenefitCategory`, `ResetType` (incl. `"one_time"`), `CalendarPeriod`, `ResetConfig` (incl. `expiresDate?`), `BenefitTemplate`, `CardType`
- User data types: `UsageRecord`, `Benefit` (incl. `autoRecur`), `CreditCard`, `AppSettings` (incl. `logLevel`, `debugLogEnabled`), `AppData`
- Export `LogLevel` type from here (or re-export from logger)
- `CARD_TYPE_NAMES` mapping: slug → display name for all 5 built-in cards

### `getCardDisplayName` helper
- Priority: `alias` > `"{typeName} ···{last4(cardNumber)}"` > `customName` (for custom) > `typeName`
- Must handle all combinations of present/absent fields

## Test Requirements
- `getCardDisplayName`: alias present, no alias with card number, custom card with customName, fallback to type name
- 4 tests minimum

## Acceptance Criteria
- [ ] 4+ tests pass
- [ ] All types exported and consistent with spec
- [ ] `ResetType` includes `"one_time"`, `ResetConfig` includes `expiresDate?`
- [ ] Lint clean
- [ ] Commit: `add type definitions and display name helper`
