# Task 20: Card and Benefit Editors

## Goal
Build forms for adding/editing cards and benefits.

## Files
- Create: `src/views/main/CardEditor.tsx`, `src/views/main/CardEditor.test.tsx`
- Create: `src/views/main/BenefitEditor.tsx`, `src/views/main/BenefitEditor.test.tsx`

## Requirements

### CardEditor
- **Mode**: create or edit (pre-fills existing data)
- **Template selector**: dropdown of CARD_TEMPLATES + "custom" option. Selecting a template pre-fills annualFee, color, and creates benefits from template defaults.
- **Fields**: card type, owner, alias, cardNumber, annualFee, cardOpenDate, color picker
- **Submit**: calls `store.addCard` (create) or `store.updateCard` (edit)
- Log `metrics.count("card.added")` on create

### BenefitEditor
- **Mode**: create or edit
- **Fields**: name, description, faceValue, category (dropdown), resetType (dropdown)
- **Conditional fields** based on resetType:
  - calendar → period dropdown + applicableMonths multi-select
  - since_last_use → cooldownDays number input
  - subscription → autoRecur toggle
  - one_time → expiresDate date picker (optional)
- **Submit**: calls `store.addBenefit` (create) or updates benefit

## Test Requirements
- CardEditor: pre-fills on edit, template selection populates defaults, submit calls correct store action
- BenefitEditor: pre-fills on edit, conditional fields show/hide by resetType, submit creates correct data
- ~6 tests minimum

## Acceptance Criteria
- [ ] All tests pass
- [ ] Lint clean
- [ ] Commit: `add CardEditor and BenefitEditor forms`
