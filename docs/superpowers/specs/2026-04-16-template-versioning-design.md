# Template Versioning & Auto-Sync Design

## Problem

When built-in card templates are updated (benefits added, removed, or modified), existing user data is not synced. Users must manually reconcile changes. The goal is to make template updates seamless — users see updated benefits automatically on app launch without any manual intervention.

## Design Decisions

- **Per-template monotonic integer version** — each CardType (built-in and user-created) has a `version: number` starting at 1. No semver, no changelog.
- **Snapshot diff, not migration chain** — sync compares current user data against current template. Jumping multiple versions is a single diff, not sequential migrations.
- **`templateBenefitId` as matching key** — stable, developer-defined semantic ID for built-in templates (e.g., `"airline_credit"`), auto-generated nanoid for user-created templates.
- **Always overwrite template fields** — no tracking of user modifications to template-sourced benefits. Template is authoritative.
- **Built-in benefits cannot be deleted** — users can only hide/unhide. Eliminates the "deleted benefit reappears" problem.
- **Deleted benefits enter expired state** — removed template benefits are marked `expired` with a timestamp, then fully removed at the next card anniversary.
- **Sync is silent** — runs at app startup, no user-facing notifications.
- **Idempotent** — multiple windows calling sync concurrently is safe; fast path skips when versions match.

## Data Model Changes

### CardType (all templates, built-in + user-created)

New field:
- `version: number` — monotonic integer, starts at 1. Built-in: developer bumps manually. User-created: auto-increments on each template edit save.

### BenefitTemplate (all template benefits)

New field:
- `templateBenefitId: string` — unique within a CardType. Built-in: developer-defined semantic ID (e.g., `"airline_credit"`). User-created: auto-generated nanoid.

### Benefit (user data)

New fields:
- `templateBenefitId?: string` — links to template benefit. Absent only for standalone user-created benefits not backed by any template.
- `expired?: boolean` — set when template removes this benefit.
- `expiredAt?: string` — ISO date when the benefit was marked expired.

### CreditCard (user data)

New field:
- `templateVersion?: number` — version of template last synced to. `undefined` means legacy data (pre-versioning).

## UI Change

Built-in benefits (those with `templateBenefitId` matching a built-in template) show hide/unhide only — no delete option.

## Core Logic: `syncCardWithTemplate`

### Signature

```ts
syncCardWithTemplate(
  card: CreditCard,
  template: CardType,
  today: string // ISO date
) → { card: CreditCard, changes: SyncChange[] }
```

Pure function. `changes` array is for debug logging only.

### Execution Condition

- `card.cardTypeSlug === template.slug`
- `card.templateVersion === undefined` (legacy) or `card.templateVersion < template.version`
- If versions match → return unchanged (fast path)

### Phase 1 — Legacy Bootstrap (only when `templateVersion === undefined`)

Match user benefits to template benefits by `name`:
- Match found → set `benefit.templateBenefitId` from template
- No match in user data → template benefit treated as new (Phase 2 handles)
- No match in template → user benefit treated as custom (left alone)

Edge case: if user renamed a legacy benefit, name matching fails. The template benefit is added as new, the renamed benefit is treated as custom. One-time cost; user can manually clean up the duplicate.

### Phase 2 — Diff & Apply (by `templateBenefitId`)

| Template | User Data | Action |
|----------|-----------|--------|
| Has benefit | Has matching benefit | **Modify** — overwrite template fields, preserve user fields |
| Has benefit | No match | **Add** — create new Benefit with nanoid, empty usageRecords |
| No benefit | Has matching benefit | **Delete** — set `expired: true`, `expiredAt: today` |
| N/A | No `templateBenefitId` | **Skip** — user custom benefit, untouched |

**Template fields (overwritten on sync):** name, description, faceValue, category, resetType, resetConfig, rolloverable, rolloverMaxYears

**User fields (preserved on sync):** id, usageRecords, hidden, templateBenefitId

### Phase 3 — Expired Benefit Cleanup

For each benefit with `expired: true`:
- Compute the next card anniversary after `expiredAt` (based on `card.openDate`)
- If `today >= nextAnniversary` → remove from benefits array
- Otherwise → keep (user can still see historical usage records)

### Final Step

Set `card.templateVersion = template.version`.

## Integration Points

### App Startup (`initPersistence()`)

```
loadBuiltinCardTypes()            ← existing
loadUserCardTypes()               ← existing
hydrate cards from disk           ← existing
── new ──
syncAllCardsWithTemplates()       ← iterate all cards, call syncCardWithTemplate
  → persist to disk if any changes
── existing ──
recalculate()
subscribe store → debounced save
```

Both MainWindow and TrayPanel call `initPersistence()`, so both windows get sync. Fast path (version match) ensures concurrent calls are safe.

### User Template Edit Save

```
saveUserCardType(updated)
  → version++
  → persist template to disk
  → iterate cards using this template, call syncCardWithTemplate
  → persist updated cards
```

### Data Import (`importData()`)

```
parse + validate JSON             ← existing
run migrations                    ← existing
── new ──
syncAllCardsWithTemplates()       ← imported data may be behind current templates
── existing ──
hydrate store
```

### No Changes Needed

- `exportData()` — templateVersion is included naturally in card data
- `recalculate()` — runs after sync, sees already-synced data
- Cross-window sync — store subscribe propagates sync changes via existing mechanism

## Three-Phase Execution Plan

### Phase 1: Add versioning infrastructure + legacy compatibility

- Type changes (all new fields above)
- `syncCardWithTemplate` pure function with full logic including legacy name-based bootstrap
- Wire into `initPersistence()` and `importData()`
- UI: built-in benefits → hide only, no delete
- Full test coverage (legacy bootstrap, add/modify/delete, expired cleanup, fast path skip, idempotency)
- Templates do NOT yet have version/templateBenefitId — sync won't trigger, pure infrastructure

### Phase 2: Migrate all built-in templates to v1

- Add `version: 1` to every JSON template
- Add `templateBenefitId` to every BenefitTemplate in JSON
- User-created templates: existing templates without version/templateBenefitId get auto-set on first app launch. New templates created after this phase ship with version and templateBenefitId from creation.
- On app launch, all legacy cards trigger sync → name-based bootstrap → diff → templateVersion set to 1
- Verify: after launch, all cards have `templateVersion: 1`, all built-in benefits have `templateBenefitId`

### Phase 3: Clean up legacy logic

- Remove Phase 1 (name-based matching) from `syncCardWithTemplate`
- `templateVersion === undefined` can be treated as version 0 (simple numeric comparison)
- Remove legacy-specific test cases
- Only `templateBenefitId` matching path remains
