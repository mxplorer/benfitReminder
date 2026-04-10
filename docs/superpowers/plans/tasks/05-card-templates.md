# Task 05: Built-in Card Templates

## Goal
Define the 5 built-in card type templates with all their default benefits.

## Files
- Create: `src/models/templates.ts`, `src/models/templates.test.ts`

## Requirements

Export `CARD_TEMPLATES: CardType[]` with these 5 cards (see spec "Built-in Card Templates" for exact benefit data):

| Card | Slug | Annual Fee | Color | Benefits |
|------|------|-----------|-------|----------|
| Amex Platinum | `amex_platinum` | $895 | #8E9EAF | 13 benefits |
| Hilton Aspire | `amex_aspire` | $550 | #1A5276 | 6 benefits |
| Chase Sapphire Preferred | `chase_sapphire_preferred` | $95 | #2471A3 | 3 benefits |
| Chase Sapphire Reserve | `chase_sapphire_reserve` | $795 | #1A1A2E | 10 benefits |
| Chase Marriott Boundless | `chase_marriott_boundless` | $95 | #6B2D5B | 4 benefits |

### Chase Marriott Boundless special notes
- 2 of the 4 benefits are `resetType: "one_time"` with `expiresDate`
- $50 Airline Credit H1: expires 2026-06-30
- $50 Airline Credit H2: expires 2026-12-31
- These are 2026 limited-time promotional benefits (require $250+ airline spend each)

## Test Requirements
- Contains 5 card types
- Amex Platinum annual fee = 895
- Chase Sapphire Reserve annual fee = 795
- Chase Marriott Boundless: annual fee = 95, has 2 one_time benefits with correct expiresDate
- All benefits have valid resetType
- Calendar benefits with applicableMonths have valid month numbers (1-12)
- one_time benefits with expiresDate have valid ISO date format
- 7 tests minimum

## Acceptance Criteria
- [ ] 7+ tests pass
- [ ] All template data matches spec exactly
- [ ] Lint clean
- [ ] Commit: `add built-in card type templates with 2025-2026 benefit data`
