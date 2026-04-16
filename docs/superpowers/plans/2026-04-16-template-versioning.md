# Template Versioning & Auto-Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make card template updates (new/removed/modified benefits) automatically sync to user data on app startup, with no user intervention.

**Architecture:** A pure-function `syncCardWithTemplate()` in `src/utils/templateSync.ts` diffs user card data against current templates by `templateBenefitId`, applying adds/modifies/deletes. Runs once per app startup inside `initPersistence()`, after hydrate, before recalculate. Three-phase rollout: (1) add infrastructure + legacy compat, (2) migrate all templates to v1, (3) remove legacy code paths.

**Tech Stack:** TypeScript, Zustand, Vitest

**Spec:** `docs/superpowers/specs/2026-04-16-template-versioning-design.md`

---

## Phase 1: Versioning Infrastructure + Legacy Compatibility

### Task 1: Add version and templateBenefitId to type definitions

**Files:**
- Modify: `src/models/types.ts:44-63` (BenefitTemplate, CardType)
- Modify: `src/models/types.ts:77-106` (Benefit, CreditCard)

- [ ] **Step 1: Add `templateBenefitId` to `BenefitTemplate`**

In `src/models/types.ts`, update the `BenefitTemplate` interface:

```typescript
export interface BenefitTemplate {
  templateBenefitId: string;
  name: string;
  description: string;
  faceValue: number;
  category: BenefitCategory;
  resetType: ResetType;
  resetConfig: ResetConfig;
  rolloverable?: boolean;
  rolloverMaxYears?: number;
}
```

- [ ] **Step 2: Add `version` to `CardType`**

```typescript
export interface CardType {
  slug: string;
  name: string;
  defaultAnnualFee: number;
  color: string;
  image?: string;
  isBuiltin: boolean;
  version: number;
  defaultBenefits: BenefitTemplate[];
}
```

- [ ] **Step 3: Add `templateBenefitId`, `expired`, `expiredAt` to `Benefit`**

```typescript
export interface Benefit {
  id: string;
  templateBenefitId?: string;
  name: string;
  description: string;
  faceValue: number;
  category: BenefitCategory;
  resetType: ResetType;
  resetConfig: ResetConfig;
  isHidden: boolean;
  rolloverable: boolean;
  rolloverMaxYears: number;
  usageRecords: UsageRecord[];
  expired?: boolean;
  expiredAt?: string;
}
```

- [ ] **Step 4: Add `templateVersion` to `CreditCard`**

```typescript
export interface CreditCard {
  id: string;
  owner: string;
  cardTypeSlug: string;
  customName?: string;
  alias?: string;
  cardNumber?: string;
  annualFee: number;
  cardOpenDate: string;
  color: string;
  isEnabled: boolean;
  benefits: Benefit[];
  statementClosingDay?: number;
  templateVersion?: number;
}
```

- [ ] **Step 5: Fix compilation errors**

The type changes will cause errors in `parseCardTypeJson` and template JSON files. For now, make `templateBenefitId` and `version` optional during parsing to maintain backward compatibility.

In `src/models/cardTypeLoader.ts`, update `parseCardTypeJson`:

```typescript
export const parseCardTypeJson = (raw: unknown): Omit<CardType, "isBuiltin"> => {
  // ... existing validation ...

  return {
    slug: obj.slug,
    name: obj.name,
    defaultAnnualFee: typeof obj.defaultAnnualFee === "number" ? obj.defaultAnnualFee : 0,
    color: obj.color,
    version: typeof obj.version === "number" ? obj.version : 0,
    defaultBenefits: Array.isArray(obj.defaultBenefits)
      ? (obj.defaultBenefits as BenefitTemplate[])
      : [],
  };
};
```

Note: `version: 0` means "unversioned template" — will be treated same as legacy cards with `templateVersion === undefined`. Templates without `templateBenefitId` on their benefits won't trigger sync until Phase 2 adds them.

- [ ] **Step 6: Run type checker and fix any remaining errors**

Run: `npx tsc --noEmit`
Expected: no errors. Fix any remaining type mismatches in test files or components that construct `CardType`/`BenefitTemplate` objects.

- [ ] **Step 7: Run existing tests**

Run: `npm run test`
Expected: all existing tests pass. Some tests constructing `CardType` may need `version: 0` added.

- [ ] **Step 8: Commit**

```bash
git add src/models/types.ts src/models/cardTypeLoader.ts
# plus any test files that needed fixes
git commit -m "add version and templateBenefitId fields to template and card types"
```

---

### Task 2: Implement `syncCardWithTemplate` pure function

**Files:**
- Create: `src/utils/templateSync.ts`
- Create: `src/utils/templateSync.test.ts`

- [ ] **Step 1: Write test for fast-path skip (versions match)**

Create `src/utils/templateSync.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import type { CreditCard, CardType } from "../models/types";
import { syncCardWithTemplate } from "./templateSync";

const makeTemplate = (overrides?: Partial<CardType>): CardType => ({
  slug: "test_card",
  name: "Test Card",
  defaultAnnualFee: 100,
  color: "#000",
  isBuiltin: true,
  version: 1,
  defaultBenefits: [
    {
      templateBenefitId: "benefit_a",
      name: "Benefit A",
      description: "Desc A",
      faceValue: 100,
      category: "travel",
      resetType: "calendar",
      resetConfig: { period: "annual" },
    },
  ],
  ...overrides,
});

const makeCard = (overrides?: Partial<CreditCard>): CreditCard => ({
  id: "card-1",
  owner: "user",
  cardTypeSlug: "test_card",
  annualFee: 100,
  cardOpenDate: "2025-06-15",
  color: "#000",
  isEnabled: true,
  benefits: [
    {
      id: "b-1",
      templateBenefitId: "benefit_a",
      name: "Benefit A",
      description: "Desc A",
      faceValue: 100,
      category: "travel",
      resetType: "calendar",
      resetConfig: { period: "annual" },
      isHidden: false,
      rolloverable: false,
      rolloverMaxYears: 2,
      usageRecords: [],
    },
  ],
  templateVersion: 1,
  ...overrides,
});

describe("syncCardWithTemplate", () => {
  it("skips sync when card templateVersion matches template version (fast path)", () => {
    const card = makeCard({ templateVersion: 1 });
    const template = makeTemplate({ version: 1 });
    const result = syncCardWithTemplate(card, template, "2026-04-16");
    expect(result.card).toBe(card); // same reference, no copy
    expect(result.changes).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/templateSync.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation for fast path**

Create `src/utils/templateSync.ts`:

```typescript
import type { CreditCard, CardType } from "../models/types";

export interface SyncChange {
  type: "added" | "modified" | "expired" | "cleaned";
  templateBenefitId: string;
  benefitName: string;
}

export const syncCardWithTemplate = (
  card: CreditCard,
  template: CardType,
  today: string,
): { card: CreditCard; changes: SyncChange[] } => {
  // Fast path: already in sync
  if (card.templateVersion !== undefined && card.templateVersion >= template.version) {
    return { card, changes: [] };
  }

  // TODO: implement sync logic
  return { card: { ...card, templateVersion: template.version }, changes: [] };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/templateSync.test.ts`
Expected: PASS

- [ ] **Step 5: Write test for adding new benefits**

Add to the describe block:

```typescript
  it("adds benefits present in template but missing from card", () => {
    const template = makeTemplate({
      version: 2,
      defaultBenefits: [
        {
          templateBenefitId: "benefit_a",
          name: "Benefit A",
          description: "Desc A",
          faceValue: 100,
          category: "travel",
          resetType: "calendar",
          resetConfig: { period: "annual" },
        },
        {
          templateBenefitId: "benefit_b",
          name: "Benefit B",
          description: "Desc B",
          faceValue: 200,
          category: "dining",
          resetType: "calendar",
          resetConfig: { period: "monthly" },
        },
      ],
    });
    const card = makeCard({ templateVersion: 1 });

    const result = syncCardWithTemplate(card, template, "2026-04-16");

    expect(result.card.benefits).toHaveLength(2);
    expect(result.card.templateVersion).toBe(2);

    const added = result.card.benefits.find((b) => b.templateBenefitId === "benefit_b");
    expect(added).toBeDefined();
    expect(added!.name).toBe("Benefit B");
    expect(added!.faceValue).toBe(200);
    expect(added!.usageRecords).toEqual([]);
    expect(added!.isHidden).toBe(false);
    expect(added!.id).toBeTruthy(); // has a generated id

    expect(result.changes).toEqual([
      { type: "added", templateBenefitId: "benefit_b", benefitName: "Benefit B" },
    ]);
  });
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run src/utils/templateSync.test.ts`
Expected: FAIL — added benefit not found

- [ ] **Step 7: Write test for modifying existing benefits**

```typescript
  it("updates template fields on existing benefits, preserving user fields", () => {
    const template = makeTemplate({
      version: 2,
      defaultBenefits: [
        {
          templateBenefitId: "benefit_a",
          name: "Benefit A Renamed",
          description: "New desc",
          faceValue: 250,
          category: "hotel",
          resetType: "anniversary",
          resetConfig: { period: "annual" },
          rolloverable: true,
          rolloverMaxYears: 3,
        },
      ],
    });
    const card = makeCard({
      templateVersion: 1,
      benefits: [
        {
          id: "b-1",
          templateBenefitId: "benefit_a",
          name: "Benefit A",
          description: "Desc A",
          faceValue: 100,
          category: "travel",
          resetType: "calendar",
          resetConfig: { period: "annual" },
          isHidden: true,
          rolloverable: false,
          rolloverMaxYears: 2,
          usageRecords: [{ usedDate: "2026-01-15", faceValue: 100, actualValue: 80 }],
        },
      ],
    });

    const result = syncCardWithTemplate(card, template, "2026-04-16");
    const updated = result.card.benefits[0];

    // Template fields overwritten
    expect(updated.name).toBe("Benefit A Renamed");
    expect(updated.description).toBe("New desc");
    expect(updated.faceValue).toBe(250);
    expect(updated.category).toBe("hotel");
    expect(updated.resetType).toBe("anniversary");
    expect(updated.rolloverable).toBe(true);
    expect(updated.rolloverMaxYears).toBe(3);

    // User fields preserved
    expect(updated.id).toBe("b-1");
    expect(updated.isHidden).toBe(true);
    expect(updated.usageRecords).toHaveLength(1);
    expect(updated.usageRecords[0].actualValue).toBe(80);

    expect(result.changes).toEqual([
      { type: "modified", templateBenefitId: "benefit_a", benefitName: "Benefit A Renamed" },
    ]);
  });
```

- [ ] **Step 8: Write test for expiring removed benefits**

```typescript
  it("marks benefits as expired when removed from template", () => {
    const template = makeTemplate({
      version: 2,
      defaultBenefits: [], // benefit_a removed
    });
    const card = makeCard({ templateVersion: 1 });

    const result = syncCardWithTemplate(card, template, "2026-04-16");
    const expired = result.card.benefits[0];

    expect(expired.expired).toBe(true);
    expect(expired.expiredAt).toBe("2026-04-16");
    expect(expired.usageRecords).toEqual([]); // preserved
    expect(expired.templateBenefitId).toBe("benefit_a");

    expect(result.changes).toEqual([
      { type: "expired", templateBenefitId: "benefit_a", benefitName: "Benefit A" },
    ]);
  });
```

- [ ] **Step 9: Write test for cleaning up expired benefits at anniversary**

```typescript
  it("removes expired benefits after card anniversary passes", () => {
    const template = makeTemplate({
      version: 2,
      defaultBenefits: [],
    });
    const card = makeCard({
      templateVersion: 1,
      cardOpenDate: "2025-06-15", // anniversary is June 15
      benefits: [
        {
          id: "b-1",
          templateBenefitId: "benefit_a",
          name: "Benefit A",
          description: "Desc A",
          faceValue: 100,
          category: "travel",
          resetType: "calendar",
          resetConfig: { period: "annual" },
          isHidden: false,
          rolloverable: false,
          rolloverMaxYears: 2,
          usageRecords: [],
          expired: true,
          expiredAt: "2026-01-10", // expired before next anniversary (2026-06-15)
        },
      ],
    });

    // Today is after the anniversary (2026-06-15)
    const result = syncCardWithTemplate(card, template, "2026-07-01");
    expect(result.card.benefits).toHaveLength(0);
    expect(result.changes).toEqual([
      { type: "cleaned", templateBenefitId: "benefit_a", benefitName: "Benefit A" },
    ]);
  });

  it("keeps expired benefits if anniversary has not passed yet", () => {
    const template = makeTemplate({
      version: 2,
      defaultBenefits: [],
    });
    const card = makeCard({
      templateVersion: 2, // already synced to v2
      cardOpenDate: "2025-06-15",
      benefits: [
        {
          id: "b-1",
          templateBenefitId: "benefit_a",
          name: "Benefit A",
          description: "Desc A",
          faceValue: 100,
          category: "travel",
          resetType: "calendar",
          resetConfig: { period: "annual" },
          isHidden: false,
          rolloverable: false,
          rolloverMaxYears: 2,
          usageRecords: [],
          expired: true,
          expiredAt: "2026-04-01", // expired, next anniversary is 2026-06-15
        },
      ],
    });

    // Today is before the anniversary
    const result = syncCardWithTemplate(card, template, "2026-05-01");
    expect(result.card.benefits).toHaveLength(1);
    expect(result.changes).toHaveLength(0);
  });
```

- [ ] **Step 10: Write test for skipping custom benefits**

```typescript
  it("leaves custom benefits (no templateBenefitId) untouched", () => {
    const template = makeTemplate({ version: 2 });
    const customBenefit = {
      id: "custom-1",
      name: "My Custom Perk",
      description: "Custom",
      faceValue: 50,
      category: "other" as const,
      resetType: "one_time" as const,
      resetConfig: {},
      isHidden: false,
      rolloverable: false,
      rolloverMaxYears: 2,
      usageRecords: [],
    };
    const card = makeCard({
      templateVersion: 1,
      benefits: [...makeCard().benefits, customBenefit],
    });

    const result = syncCardWithTemplate(card, template, "2026-04-16");
    const custom = result.card.benefits.find((b) => b.id === "custom-1");
    expect(custom).toBeDefined();
    expect(custom!.name).toBe("My Custom Perk");
    // custom benefit has no templateBenefitId, should not be touched
    expect(custom!.templateBenefitId).toBeUndefined();
  });
```

- [ ] **Step 11: Write test for legacy bootstrap (name-based matching)**

```typescript
  it("bootstraps templateBenefitId from name matching for legacy cards", () => {
    const template = makeTemplate({ version: 1 });
    const card = makeCard({
      templateVersion: undefined, // legacy
      benefits: [
        {
          id: "b-1",
          // no templateBenefitId
          name: "Benefit A",
          description: "Desc A",
          faceValue: 100,
          category: "travel",
          resetType: "calendar",
          resetConfig: { period: "annual" },
          isHidden: false,
          rolloverable: false,
          rolloverMaxYears: 2,
          usageRecords: [{ usedDate: "2026-01-01", faceValue: 100, actualValue: 80 }],
        },
      ],
    });

    const result = syncCardWithTemplate(card, template, "2026-04-16");
    const synced = result.card.benefits[0];

    expect(synced.templateBenefitId).toBe("benefit_a");
    expect(synced.id).toBe("b-1"); // preserved
    expect(synced.usageRecords).toHaveLength(1); // preserved
    expect(result.card.templateVersion).toBe(1);
  });

  it("treats unmatched legacy benefits as custom during bootstrap", () => {
    const template = makeTemplate({ version: 1 });
    const card = makeCard({
      templateVersion: undefined,
      benefits: [
        {
          id: "b-1",
          name: "Benefit A", // matches template
          description: "Desc A",
          faceValue: 100,
          category: "travel",
          resetType: "calendar",
          resetConfig: { period: "annual" },
          isHidden: false,
          rolloverable: false,
          rolloverMaxYears: 2,
          usageRecords: [],
        },
        {
          id: "b-renamed",
          name: "Renamed Perk", // no match in template
          description: "Custom",
          faceValue: 50,
          category: "other",
          resetType: "one_time",
          resetConfig: {},
          isHidden: false,
          rolloverable: false,
          rolloverMaxYears: 2,
          usageRecords: [],
        },
      ],
    });

    const result = syncCardWithTemplate(card, template, "2026-04-16");
    expect(result.card.benefits).toHaveLength(2);

    const matched = result.card.benefits.find((b) => b.id === "b-1");
    expect(matched!.templateBenefitId).toBe("benefit_a");

    const unmatched = result.card.benefits.find((b) => b.id === "b-renamed");
    expect(unmatched!.templateBenefitId).toBeUndefined();
    expect(unmatched!.name).toBe("Renamed Perk");
  });
```

- [ ] **Step 12: Write test for does not modify when template fields are identical**

```typescript
  it("reports no changes when template fields are identical to existing benefit", () => {
    const template = makeTemplate({ version: 2 });
    const card = makeCard({ templateVersion: 1 }); // benefit_a already matches template v2

    const result = syncCardWithTemplate(card, template, "2026-04-16");
    expect(result.card.templateVersion).toBe(2);
    // No "modified" change because all fields are identical
    expect(result.changes).toHaveLength(0);
  });
```

- [ ] **Step 13: Run all tests to verify they fail**

Run: `npx vitest run src/utils/templateSync.test.ts`
Expected: FAIL — sync logic not implemented

- [ ] **Step 14: Implement full sync logic**

Replace the TODO in `src/utils/templateSync.ts`:

```typescript
import type { Benefit, BenefitTemplate, CreditCard, CardType } from "../models/types";

export interface SyncChange {
  type: "added" | "modified" | "expired" | "cleaned";
  templateBenefitId: string;
  benefitName: string;
}

/** Fields copied from template to benefit on sync. */
const TEMPLATE_FIELDS = [
  "name",
  "description",
  "faceValue",
  "category",
  "resetType",
  "resetConfig",
  "rolloverable",
  "rolloverMaxYears",
] as const;

/** Check if any template-controlled field differs between benefit and template. */
const hasFieldChanges = (benefit: Benefit, tmpl: BenefitTemplate): boolean =>
  TEMPLATE_FIELDS.some((field) => {
    const bVal = benefit[field];
    const tVal = tmpl[field];
    if (typeof bVal === "object" || typeof tVal === "object") {
      return JSON.stringify(bVal) !== JSON.stringify(tVal);
    }
    return bVal !== tVal;
  });

/** Apply template fields onto an existing benefit, preserving user fields. */
const applyTemplateFields = (benefit: Benefit, tmpl: BenefitTemplate): Benefit => ({
  ...benefit,
  name: tmpl.name,
  description: tmpl.description,
  faceValue: tmpl.faceValue,
  category: tmpl.category,
  resetType: tmpl.resetType,
  resetConfig: tmpl.resetConfig,
  rolloverable: tmpl.rolloverable ?? false,
  rolloverMaxYears: tmpl.rolloverMaxYears ?? 2,
});

/** Create a new Benefit from a BenefitTemplate. */
const createBenefitFromTemplate = (tmpl: BenefitTemplate): Benefit => ({
  id: crypto.randomUUID(),
  templateBenefitId: tmpl.templateBenefitId,
  name: tmpl.name,
  description: tmpl.description,
  faceValue: tmpl.faceValue,
  category: tmpl.category,
  resetType: tmpl.resetType,
  resetConfig: tmpl.resetConfig,
  isHidden: false,
  rolloverable: tmpl.rolloverable ?? false,
  rolloverMaxYears: tmpl.rolloverMaxYears ?? 2,
  usageRecords: [],
});

/**
 * Compute the next card anniversary on or after a given date.
 * Anniversary = same month+day as cardOpenDate each year.
 */
const getNextAnniversaryAfter = (cardOpenDate: string, afterDate: string): string => {
  const open = new Date(cardOpenDate + "T00:00:00");
  const after = new Date(afterDate + "T00:00:00");
  const month = open.getMonth();
  const day = open.getDate();

  // Try same year as afterDate
  let candidate = new Date(after.getFullYear(), month, day);
  if (candidate <= after) {
    candidate = new Date(after.getFullYear() + 1, month, day);
  }
  return candidate.toISOString().slice(0, 10);
};

export const syncCardWithTemplate = (
  card: CreditCard,
  template: CardType,
  today: string,
): { card: CreditCard; changes: SyncChange[] } => {
  const changes: SyncChange[] = [];

  // Phase 3: Clean expired benefits (runs even on fast path for version-matched cards)
  const cleanedBenefits = card.benefits.filter((b) => {
    if (!b.expired || !b.expiredAt) return true;
    const nextAnniversary = getNextAnniversaryAfter(card.cardOpenDate, b.expiredAt);
    if (today >= nextAnniversary) {
      changes.push({
        type: "cleaned",
        templateBenefitId: b.templateBenefitId ?? b.id,
        benefitName: b.name,
      });
      return false;
    }
    return true;
  });

  const cardAfterClean =
    cleanedBenefits.length !== card.benefits.length
      ? { ...card, benefits: cleanedBenefits }
      : card;

  // Fast path: already in sync (but still needed cleanup check above)
  if (card.templateVersion !== undefined && card.templateVersion >= template.version) {
    if (changes.length > 0) {
      return { card: cardAfterClean, changes };
    }
    return { card, changes: [] };
  }

  // Phase 1: Legacy bootstrap — match by name to establish templateBenefitId
  let benefits = [...cardAfterClean.benefits];
  if (card.templateVersion === undefined) {
    const templateByName = new Map(
      template.defaultBenefits.map((t) => [t.name, t]),
    );
    benefits = benefits.map((b) => {
      if (b.templateBenefitId) return b; // already linked
      const match = templateByName.get(b.name);
      if (match) {
        return { ...b, templateBenefitId: match.templateBenefitId };
      }
      return b; // unmatched = custom
    });
  }

  // Phase 2: Diff & Apply by templateBenefitId
  const templateMap = new Map(
    template.defaultBenefits.map((t) => [t.templateBenefitId, t]),
  );
  const userByTemplateId = new Map(
    benefits
      .filter((b) => b.templateBenefitId)
      .map((b) => [b.templateBenefitId!, b]),
  );

  // Modify existing + expire removed
  const updatedBenefits = benefits.map((b) => {
    if (!b.templateBenefitId) return b; // custom benefit, skip

    const tmpl = templateMap.get(b.templateBenefitId);
    if (!tmpl) {
      // Benefit removed from template — mark expired (if not already)
      if (!b.expired) {
        changes.push({
          type: "expired",
          templateBenefitId: b.templateBenefitId,
          benefitName: b.name,
        });
        return { ...b, expired: true, expiredAt: today };
      }
      return b;
    }

    // Benefit still in template — update fields if changed
    if (hasFieldChanges(b, tmpl)) {
      changes.push({
        type: "modified",
        templateBenefitId: b.templateBenefitId,
        benefitName: tmpl.name,
      });
      return applyTemplateFields(b, tmpl);
    }
    return b;
  });

  // Add new benefits
  for (const [tid, tmpl] of templateMap) {
    if (!userByTemplateId.has(tid)) {
      changes.push({
        type: "added",
        templateBenefitId: tid,
        benefitName: tmpl.name,
      });
      updatedBenefits.push(createBenefitFromTemplate(tmpl));
    }
  }

  return {
    card: {
      ...cardAfterClean,
      benefits: updatedBenefits,
      templateVersion: template.version,
    },
    changes,
  };
};
```

- [ ] **Step 15: Run all tests to verify they pass**

Run: `npx vitest run src/utils/templateSync.test.ts`
Expected: all PASS

- [ ] **Step 16: Commit**

```bash
git add src/utils/templateSync.ts src/utils/templateSync.test.ts
git commit -m "add syncCardWithTemplate pure function with full test coverage"
```

---

### Task 3: Add `syncAllCardsWithTemplates` and wire into persistence

**Files:**
- Create: `src/utils/templateSync.ts` (add `syncAllCardsWithTemplates`)
- Modify: `src/tauri/persistence.ts:95-128`
- Modify: `src/stores/useCardStore.ts:273-297` (importData)

- [ ] **Step 1: Write test for `syncAllCardsWithTemplates`**

Add to `src/utils/templateSync.test.ts`:

```typescript
import { syncAllCardsWithTemplates } from "./templateSync";

describe("syncAllCardsWithTemplates", () => {
  it("syncs each card against its matching template", () => {
    const templates: CardType[] = [
      makeTemplate({
        slug: "card_a",
        version: 2,
        defaultBenefits: [
          {
            templateBenefitId: "b1",
            name: "Updated B1",
            description: "New",
            faceValue: 999,
            category: "travel",
            resetType: "calendar",
            resetConfig: { period: "annual" },
          },
        ],
      }),
    ];
    const cards: CreditCard[] = [
      makeCard({
        cardTypeSlug: "card_a",
        templateVersion: 1,
        benefits: [
          {
            id: "x",
            templateBenefitId: "b1",
            name: "Old B1",
            description: "Old",
            faceValue: 100,
            category: "travel",
            resetType: "calendar",
            resetConfig: { period: "annual" },
            isHidden: false,
            rolloverable: false,
            rolloverMaxYears: 2,
            usageRecords: [],
          },
        ],
      }),
    ];

    const result = syncAllCardsWithTemplates(cards, templates, "2026-04-16");
    expect(result.cards[0].benefits[0].name).toBe("Updated B1");
    expect(result.cards[0].benefits[0].faceValue).toBe(999);
    expect(result.hasChanges).toBe(true);
  });

  it("skips cards with no matching template", () => {
    const templates: CardType[] = [makeTemplate({ slug: "other" })];
    const cards: CreditCard[] = [makeCard({ cardTypeSlug: "no_match" })];

    const result = syncAllCardsWithTemplates(cards, templates, "2026-04-16");
    expect(result.cards[0]).toBe(cards[0]); // unchanged reference
    expect(result.hasChanges).toBe(false);
  });

  it("returns hasChanges=false when all cards are already in sync", () => {
    const templates: CardType[] = [makeTemplate({ slug: "test_card", version: 1 })];
    const cards: CreditCard[] = [makeCard({ cardTypeSlug: "test_card", templateVersion: 1 })];

    const result = syncAllCardsWithTemplates(cards, templates, "2026-04-16");
    expect(result.hasChanges).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/templateSync.test.ts`
Expected: FAIL — syncAllCardsWithTemplates not found

- [ ] **Step 3: Implement `syncAllCardsWithTemplates`**

Add to `src/utils/templateSync.ts`:

```typescript
import { createLogger } from "../lib/logger";

const logger = createLogger("utils.templateSync");

export const syncAllCardsWithTemplates = (
  cards: CreditCard[],
  templates: CardType[],
  today: string,
): { cards: CreditCard[]; hasChanges: boolean } => {
  const templateMap = new Map(templates.map((t) => [t.slug, t]));
  let hasChanges = false;

  const updatedCards = cards.map((card) => {
    const template = templateMap.get(card.cardTypeSlug);
    if (!template) return card;

    const result = syncCardWithTemplate(card, template, today);
    if (result.changes.length > 0) {
      hasChanges = true;
      logger.debug("Card synced with template", {
        cardId: card.id,
        slug: card.cardTypeSlug,
        changes: result.changes,
      });
    }
    return result.card;
  });

  return { cards: updatedCards, hasChanges };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/templateSync.test.ts`
Expected: all PASS

- [ ] **Step 5: Wire into `initPersistence`**

In `src/tauri/persistence.ts`, add import and sync call after hydrate, before recalculate:

```typescript
import { syncAllCardsWithTemplates } from "../utils/templateSync";
import { formatDate } from "../utils/period";
```

Update `initPersistence`:

```typescript
export const initPersistence = async (): Promise<void> => {
  // 0. Initialize card type registry (built-in + user templates)
  await initCardTypeRegistry();

  // 1. Hydrate from disk
  try {
    const json = await loadData();
    if (json) {
      useCardStore.getState().importData(json);
      lastSyncedJson = json;
      logger.info("Store hydrated from disk");
    }
  } catch (err) {
    logger.warn("Failed to hydrate store from disk", { error: String(err) });
  }

  // 1.5 Sync cards with current templates
  {
    const cards = useCardStore.getState().cards;
    const templates = useCardTypeStore.getState().cardTypes;
    const today = formatDate(new Date());
    const result = syncAllCardsWithTemplates(cards, templates, today);
    if (result.hasChanges) {
      useCardStore.getState().loadData(result.cards, useCardStore.getState().settings);
      logger.info("Cards synced with templates");
    }
  }

  // 2. Subscribe for auto-save + cross-window emit.
  useCardStore.subscribe((state) => {
    const json = state.exportData();
    if (json === lastSyncedJson) return;
    lastSyncedJson = json;
    debouncedSave(json);
    void emitDataChanged(json);
  });

  // 3. Initial recalculate (generation + now bump) after data load.
  useCardStore.getState().recalculate();

  // 4. Listen for cross-window data changes.
  void subscribeDataChanged();

  logger.info("Persistence initialized");
};
```

- [ ] **Step 6: Run full test suite**

Run: `npm run test`
Expected: all tests pass

- [ ] **Step 7: Commit**

```bash
git add src/utils/templateSync.ts src/utils/templateSync.test.ts src/tauri/persistence.ts
git commit -m "wire syncAllCardsWithTemplates into initPersistence after hydrate"
```

---

### Task 4: Conditionally hide delete button for built-in benefits

**Files:**
- Modify: `src/views/shared/BenefitCard.tsx:201-214`
- Modify: `src/views/shared/BenefitCard.test.tsx`

- [ ] **Step 1: Write test for hiding delete on template benefits**

Add to `src/views/shared/BenefitCard.test.tsx`:

```typescript
  it("hides delete button for benefits with templateBenefitId", () => {
    const benefit = {
      ...makeBenefit(),
      templateBenefitId: "some_template_id",
    };
    render(
      <BenefitCard
        benefit={benefit}
        card={makeCard()}
        onToggleUsage={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText("删除权益")).not.toBeInTheDocument();
  });

  it("shows delete button for custom benefits without templateBenefitId", () => {
    const benefit = makeBenefit(); // no templateBenefitId
    render(
      <BenefitCard
        benefit={benefit}
        card={makeCard()}
        onToggleUsage={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("删除权益")).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/views/shared/BenefitCard.test.tsx`
Expected: FAIL — delete button shown for template benefits

- [ ] **Step 3: Update BenefitCard to hide delete for template benefits**

In `src/views/shared/BenefitCard.tsx`, change the delete button condition from:

```tsx
{onDelete && (
```

to:

```tsx
{onDelete && !benefit.templateBenefitId && (
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/views/shared/BenefitCard.test.tsx`
Expected: all PASS

- [ ] **Step 5: Run full test suite**

Run: `npm run test`
Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add src/views/shared/BenefitCard.tsx src/views/shared/BenefitCard.test.tsx
git commit -m "hide delete button for template-backed benefits, only allow hide"
```

---

### Task 5: Handle user template version auto-increment on save

**Files:**
- Modify: `src/tauri/cardTypePersistence.ts:88-109`
- Modify: `src/tauri/cardTypePersistence.test.ts`

- [ ] **Step 1: Write test for version auto-increment**

Add to `src/tauri/cardTypePersistence.test.ts`:

```typescript
  it("increments version when saving user card type", async () => {
    const cardType: CardType = {
      slug: "my_card",
      name: "My Card",
      defaultAnnualFee: 0,
      color: "#fff",
      isBuiltin: false,
      version: 1,
      defaultBenefits: [],
    };
    await saveUserCardType(cardType);
    // Verify the saved JSON contains version
    const saved = JSON.parse(writtenJson) as Record<string, unknown>;
    expect(saved.version).toBe(1);
  });
```

Note: Adapt this test to match the existing test patterns in `cardTypePersistence.test.ts` — the file likely mocks Tauri FS APIs. The key assertion is that `version` is included in saved JSON.

- [ ] **Step 2: Update `saveUserCardType` to include `version` in persisted JSON**

In `src/tauri/cardTypePersistence.ts`, the current `saveUserCardType` strips `isBuiltin` and `image` before saving. Ensure `version` and `defaultBenefits[].templateBenefitId` are preserved (they should be naturally, since only `isBuiltin` and `image` are excluded).

Verify by reading the current save logic. If `version` is already included via spread, no code change needed — just the test.

- [ ] **Step 3: Ensure `loadUserCardTypes` parses `version` correctly**

In `src/tauri/cardTypePersistence.ts`, user card types are loaded via `parseCardTypeJson` which now returns `version: 0` for missing version field. Existing user card types without version will get `version: 0`, which is correct — they'll be treated as unversioned.

- [ ] **Step 4: Run full test suite**

Run: `npm run test`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add src/tauri/cardTypePersistence.ts src/tauri/cardTypePersistence.test.ts
git commit -m "persist version field in user card type JSON"
```

---

### Task 6: Wire template sync into `importData` flow

**Files:**
- Modify: `src/stores/useCardStore.ts:273-297`
- Modify: `src/stores/useCardStore.test.ts`

- [ ] **Step 1: Write test for import triggering sync**

Add to `src/stores/useCardStore.test.ts`:

```typescript
  it("importData runs template sync on imported cards", () => {
    // Set up card type store with a versioned template
    const { useCardTypeStore } = await import("../stores/useCardTypeStore");
    useCardTypeStore.getState().setBuiltinCardTypes([
      {
        slug: "test_card",
        name: "Test Card",
        defaultAnnualFee: 0,
        color: "#000",
        isBuiltin: true,
        version: 2,
        defaultBenefits: [
          {
            templateBenefitId: "tc.benefit_a",
            name: "Updated Name",
            description: "Updated",
            faceValue: 999,
            category: "travel",
            resetType: "calendar",
            resetConfig: { period: "annual" },
          },
        ],
      },
    ]);

    // Import data with a card at older template version
    const importJson = JSON.stringify({
      version: 1,
      cards: [
        {
          id: "c1",
          owner: "test",
          cardTypeSlug: "test_card",
          annualFee: 0,
          cardOpenDate: "2025-01-01",
          color: "#000",
          isEnabled: true,
          templateVersion: 1,
          benefits: [
            {
              id: "b1",
              templateBenefitId: "tc.benefit_a",
              name: "Old Name",
              description: "Old",
              faceValue: 100,
              category: "travel",
              resetType: "calendar",
              resetConfig: { period: "annual" },
              isHidden: false,
              rolloverable: false,
              rolloverMaxYears: 2,
              usageRecords: [],
            },
          ],
        },
      ],
    });

    useCardStore.getState().importData(importJson);
    const card = useCardStore.getState().cards[0];
    expect(card.templateVersion).toBe(2);
    expect(card.benefits[0].name).toBe("Updated Name");
    expect(card.benefits[0].faceValue).toBe(999);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/stores/useCardStore.test.ts`
Expected: FAIL — importData does not run sync

- [ ] **Step 3: Update `importData` to run sync after migrations**

In `src/stores/useCardStore.ts`, update `importData`:

```typescript
import { syncAllCardsWithTemplates } from "../utils/templateSync";
import { formatDate } from "../utils/period";
import { useCardTypeStore } from "./useCardTypeStore";
```

Update the `importData` action:

```typescript
  importData: (json) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json) as unknown;
    } catch {
      throw new Error("Invalid JSON format");
    }

    if (typeof parsed !== "object" || parsed === null) {
      throw new Error("Import data must be an object");
    }

    const data = parsed as Record<string, unknown>;
    if (typeof data.version !== "number") {
      throw new Error("Missing or invalid version field");
    }
    if (!Array.isArray(data.cards)) {
      throw new Error("Missing or invalid cards array");
    }

    const migrated = migrateCards(data.cards as CreditCard[]);
    const templates = useCardTypeStore.getState().cardTypes;
    const today = formatDate(new Date());
    const { cards: synced } = syncAllCardsWithTemplates(migrated, templates, today);

    set({
      cards: synced,
      settings: (data.settings as AppSettings | undefined) ?? { ...DEFAULT_SETTINGS },
    });
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/stores/useCardStore.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `npm run test`
Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add src/stores/useCardStore.ts src/stores/useCardStore.test.ts
git commit -m "run template sync during importData after migrations"
```

---

### Task 7: Auto-increment version and sync on user template edit save

**Files:**
- Modify: `src/tauri/cardTypePersistence.ts`
- Modify: `src/tauri/cardTypePersistence.test.ts`

This task adds a helper that bumps the user template version, generates `templateBenefitId` for new benefits, persists the template, then syncs all cards using that template.

- [ ] **Step 1: Write test for `saveAndSyncUserCardType`**

Add to `src/tauri/cardTypePersistence.test.ts`:

```typescript
import { saveAndSyncUserCardType } from "./cardTypePersistence";

  it("saveAndSyncUserCardType increments version and generates templateBenefitIds", async () => {
    const cardType: CardType = {
      slug: "my_card",
      name: "My Card",
      defaultAnnualFee: 0,
      color: "#fff",
      isBuiltin: false,
      version: 1,
      defaultBenefits: [
        {
          templateBenefitId: "my_card.existing",
          name: "Existing",
          description: "D",
          faceValue: 100,
          category: "other",
          resetType: "one_time",
          resetConfig: {},
        },
        {
          templateBenefitId: "", // new benefit, no ID yet
          name: "New Benefit",
          description: "D",
          faceValue: 50,
          category: "other",
          resetType: "one_time",
          resetConfig: {},
        },
      ],
    };

    const result = await saveAndSyncUserCardType(cardType);
    expect(result.version).toBe(2);
    expect(result.defaultBenefits[0].templateBenefitId).toBe("my_card.existing");
    expect(result.defaultBenefits[1].templateBenefitId).toBeTruthy();
    expect(result.defaultBenefits[1].templateBenefitId).not.toBe("");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tauri/cardTypePersistence.test.ts`
Expected: FAIL — function not found

- [ ] **Step 3: Implement `saveAndSyncUserCardType`**

In `src/tauri/cardTypePersistence.ts`:

```typescript
import { syncAllCardsWithTemplates } from "../utils/templateSync";
import { useCardStore } from "../stores/useCardStore";
import { useCardTypeStore } from "../stores/useCardTypeStore";
import { formatDate } from "../utils/period";

export const saveAndSyncUserCardType = async (cardType: CardType): Promise<CardType> => {
  // Bump version
  const updated: CardType = {
    ...cardType,
    version: cardType.version + 1,
    defaultBenefits: cardType.defaultBenefits.map((b) => ({
      ...b,
      templateBenefitId: b.templateBenefitId || crypto.randomUUID(),
    })),
  };

  // Persist template
  await saveUserCardType(updated);

  // Update template in registry
  useCardTypeStore.getState().removeUserCardType(updated.slug);
  useCardTypeStore.getState().addUserCardType(updated);

  // Sync affected cards
  const cards = useCardStore.getState().cards;
  const templates = useCardTypeStore.getState().cardTypes;
  const today = formatDate(new Date());
  const result = syncAllCardsWithTemplates(cards, templates, today);
  if (result.hasChanges) {
    useCardStore.getState().loadData(result.cards, useCardStore.getState().settings);
  }

  return updated;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tauri/cardTypePersistence.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `npm run test`
Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add src/tauri/cardTypePersistence.ts src/tauri/cardTypePersistence.test.ts
git commit -m "add saveAndSyncUserCardType with version bump and card sync"
```

---

## Phase 2: Migrate All Built-in Templates to v1

### Task 8: Add `version` and `templateBenefitId` to all built-in template JSONs

**Files:**
- Modify: `src/assets/card-types/amex_platinum.json`
- Modify: `src/assets/card-types/amex_aspire.json`
- Modify: `src/assets/card-types/chase_sapphire_reserve.json`
- Modify: `src/assets/card-types/chase_sapphire_preferred.json`
- Modify: `src/assets/card-types/chase_marriott_boundless.json`
- Modify: `src/assets/card-types/chase_hyatt.json`
- Modify: `src/models/templates.test.ts`

- [ ] **Step 1: Update `amex_platinum.json`**

Add `"version": 1` at top level, and `"templateBenefitId"` to each benefit:

```json
{
  "slug": "amex_platinum",
  "name": "Amex Platinum",
  "defaultAnnualFee": 895,
  "color": "#8E9EAF",
  "version": 1,
  "defaultBenefits": [
    {
      "templateBenefitId": "amex_platinum.hotel_fhr",
      "name": "$300 Hotel Credit FHR/THC",
      ...
    },
    {
      "templateBenefitId": "amex_platinum.airline_fee",
      "name": "$200 Airline Fee Credit",
      ...
    },
    {
      "templateBenefitId": "amex_platinum.oura_ring",
      "name": "$200 Oura Ring Credit",
      ...
    },
    {
      "templateBenefitId": "amex_platinum.clear_plus",
      "name": "$209 CLEAR+ Credit",
      ...
    },
    {
      "templateBenefitId": "amex_platinum.global_entry",
      "name": "$100 Global Entry / TSA PreCheck",
      ...
    },
    {
      "templateBenefitId": "amex_platinum.resy_dining",
      "name": "$100/quarter Resy Dining Credit",
      ...
    },
    {
      "templateBenefitId": "amex_platinum.lululemon",
      "name": "$75/quarter Lululemon Credit",
      ...
    },
    {
      "templateBenefitId": "amex_platinum.digital_entertainment",
      "name": "$25/mo Digital Entertainment",
      ...
    },
    {
      "templateBenefitId": "amex_platinum.uber_cash_monthly",
      "name": "$15/mo Uber Cash (Jan-Nov)",
      ...
    },
    {
      "templateBenefitId": "amex_platinum.uber_cash_dec",
      "name": "$35 Uber Cash (Dec)",
      ...
    },
    {
      "templateBenefitId": "amex_platinum.uber_one",
      "name": "$120/yr Uber One Membership",
      ...
    },
    {
      "templateBenefitId": "amex_platinum.walmart_plus",
      "name": "$12.95/mo Walmart+",
      ...
    }
  ]
}
```

ID convention: `{card_slug}.{benefit_slug}` — globally unique, human-readable.

- [ ] **Step 2: Update all other template JSONs**

Apply the same pattern to each template file. Read each file first, then add `"version": 1` and `"templateBenefitId": "{slug}.{benefit_slug}"` to every benefit. Keep all other fields unchanged.

For each file, use this naming convention:
- `amex_aspire.json`: `"amex_aspire.{benefit_slug}"`
- `chase_sapphire_reserve.json`: `"chase_sapphire_reserve.{benefit_slug}"`
- `chase_sapphire_preferred.json`: `"chase_sapphire_preferred.{benefit_slug}"`
- `chase_marriott_boundless.json`: `"chase_marriott_boundless.{benefit_slug}"`
- `chase_hyatt.json`: `"chase_hyatt.{benefit_slug}"`

Choose short but descriptive benefit slugs (e.g., `travel_credit`, `airline_h2`, `global_entry`).

- [ ] **Step 3: Update `templates.test.ts` to verify versioning**

Add tests:

```typescript
  it("every built-in card type has version >= 1", () => {
    for (const ct of BUILTIN_CARD_TYPES) {
      expect(ct.version, `${ct.slug} missing version`).toBeGreaterThanOrEqual(1);
    }
  });

  it("every built-in benefit has a templateBenefitId", () => {
    for (const ct of BUILTIN_CARD_TYPES) {
      for (const b of ct.defaultBenefits) {
        expect(b.templateBenefitId, `${ct.slug}/${b.name} missing templateBenefitId`).toBeTruthy();
      }
    }
  });

  it("templateBenefitIds are unique within each card type", () => {
    for (const ct of BUILTIN_CARD_TYPES) {
      const ids = ct.defaultBenefits.map((b) => b.templateBenefitId);
      expect(new Set(ids).size, `${ct.slug} has duplicate templateBenefitIds`).toBe(ids.length);
    }
  });
```

- [ ] **Step 4: Run tests**

Run: `npm run test`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add src/assets/card-types/*.json src/models/templates.test.ts
git commit -m "add version 1 and templateBenefitId to all built-in card templates"
```

---

### Task 9: Integration test — legacy card syncs on startup

**Files:**
- Create: `tests/template-sync-integration.test.ts`

- [ ] **Step 1: Write integration test**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import type { CreditCard, CardType } from "../src/models/types";
import { BUILTIN_CARD_TYPES } from "../src/models/templates";
import { syncAllCardsWithTemplates } from "../src/utils/templateSync";

describe("template sync integration", () => {
  it("syncs a legacy amex_platinum card to v1", () => {
    const template = BUILTIN_CARD_TYPES.find((t) => t.slug === "amex_platinum")!;
    expect(template.version).toBe(1);

    // Simulate a legacy card created before versioning
    const legacyCard: CreditCard = {
      id: "legacy-1",
      owner: "test",
      cardTypeSlug: "amex_platinum",
      annualFee: 895,
      cardOpenDate: "2025-01-15",
      color: "#8E9EAF",
      isEnabled: true,
      benefits: template.defaultBenefits.map((t, i) => ({
        id: `b-${i}`,
        name: t.name,
        description: t.description,
        faceValue: t.faceValue,
        category: t.category,
        resetType: t.resetType,
        resetConfig: t.resetConfig,
        isHidden: false,
        rolloverable: t.rolloverable ?? false,
        rolloverMaxYears: t.rolloverMaxYears ?? 2,
        usageRecords: [],
        // NO templateBenefitId — legacy
      })),
      // NO templateVersion — legacy
    };

    const result = syncAllCardsWithTemplates(
      [legacyCard],
      [template],
      "2026-04-16",
    );

    const synced = result.cards[0];
    expect(synced.templateVersion).toBe(1);
    expect(result.hasChanges).toBe(true);

    // Every benefit should now have a templateBenefitId
    for (const b of synced.benefits) {
      expect(b.templateBenefitId, `${b.name} missing templateBenefitId`).toBeTruthy();
    }

    // Benefit count should match template
    expect(synced.benefits).toHaveLength(template.defaultBenefits.length);
  });

  it("does not modify an already-synced card", () => {
    const template = BUILTIN_CARD_TYPES.find((t) => t.slug === "amex_platinum")!;

    const syncedCard: CreditCard = {
      id: "synced-1",
      owner: "test",
      cardTypeSlug: "amex_platinum",
      annualFee: 895,
      cardOpenDate: "2025-01-15",
      color: "#8E9EAF",
      isEnabled: true,
      templateVersion: 1,
      benefits: template.defaultBenefits.map((t, i) => ({
        id: `b-${i}`,
        templateBenefitId: t.templateBenefitId,
        name: t.name,
        description: t.description,
        faceValue: t.faceValue,
        category: t.category,
        resetType: t.resetType,
        resetConfig: t.resetConfig,
        isHidden: false,
        rolloverable: t.rolloverable ?? false,
        rolloverMaxYears: t.rolloverMaxYears ?? 2,
        usageRecords: [],
      })),
    };

    const result = syncAllCardsWithTemplates(
      [syncedCard],
      [template],
      "2026-04-16",
    );

    expect(result.hasChanges).toBe(false);
    expect(result.cards[0]).toBe(syncedCard); // same reference
  });
});
```

- [ ] **Step 2: Run integration test**

Run: `npx vitest run tests/template-sync-integration.test.ts`
Expected: all PASS

- [ ] **Step 3: Run full test suite**

Run: `npm run test`
Expected: all pass

- [ ] **Step 4: Commit**

```bash
git add tests/template-sync-integration.test.ts
git commit -m "add integration tests for legacy-to-v1 template sync"
```

---

## Phase 3: Clean Up Legacy Logic

### Task 10: Remove legacy name-based matching code path

**Files:**
- Modify: `src/utils/templateSync.ts`
- Modify: `src/utils/templateSync.test.ts`

- [ ] **Step 1: Remove legacy bootstrap tests**

In `src/utils/templateSync.test.ts`, remove the two legacy tests:
- `"bootstraps templateBenefitId from name matching for legacy cards"`
- `"treats unmatched legacy benefits as custom during bootstrap"`

- [ ] **Step 2: Remove legacy bootstrap code from `syncCardWithTemplate`**

In `src/utils/templateSync.ts`, remove the Phase 1 legacy bootstrap block:

```typescript
  // Remove this entire block:
  // Phase 1: Legacy bootstrap — match by name to establish templateBenefitId
  let benefits = [...cardAfterClean.benefits];
  if (card.templateVersion === undefined) {
    const templateByName = new Map(
      template.defaultBenefits.map((t) => [t.name, t]),
    );
    benefits = benefits.map((b) => {
      if (b.templateBenefitId) return b;
      const match = templateByName.get(b.name);
      if (match) {
        return { ...b, templateBenefitId: match.templateBenefitId };
      }
      return b;
    });
  }
```

Replace with:

```typescript
  const benefits = [...cardAfterClean.benefits];
```

Now `templateVersion === undefined` is simply treated as version `0`, which is `< template.version`, so the diff phase runs normally. Benefits without `templateBenefitId` are treated as custom.

- [ ] **Step 3: Remove legacy integration test**

In `tests/template-sync-integration.test.ts`, update the legacy test to reflect the new behavior: without name-based matching, legacy benefits without `templateBenefitId` are treated as custom, and template benefits are added as new.

```typescript
  it("treats legacy card benefits as custom and adds all template benefits", () => {
    const template = BUILTIN_CARD_TYPES.find((t) => t.slug === "amex_platinum")!;

    const legacyCard: CreditCard = {
      id: "legacy-1",
      owner: "test",
      cardTypeSlug: "amex_platinum",
      annualFee: 895,
      cardOpenDate: "2025-01-15",
      color: "#8E9EAF",
      isEnabled: true,
      benefits: [
        {
          id: "old-b",
          name: "$200 Airline Fee Credit",
          description: "Old desc",
          faceValue: 200,
          category: "airline",
          resetType: "calendar",
          resetConfig: { period: "annual" },
          isHidden: false,
          rolloverable: false,
          rolloverMaxYears: 2,
          usageRecords: [],
          // NO templateBenefitId
        },
      ],
    };

    const result = syncAllCardsWithTemplates([legacyCard], [template], "2026-04-16");
    const synced = result.cards[0];

    // Legacy benefit kept as custom (no templateBenefitId)
    const oldBenefit = synced.benefits.find((b) => b.id === "old-b");
    expect(oldBenefit).toBeDefined();
    expect(oldBenefit!.templateBenefitId).toBeUndefined();

    // All template benefits added as new
    const templateBenefits = synced.benefits.filter((b) => b.templateBenefitId);
    expect(templateBenefits).toHaveLength(template.defaultBenefits.length);

    expect(synced.templateVersion).toBe(1);
  });
```

- [ ] **Step 4: Run full test suite**

Run: `npm run test`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add src/utils/templateSync.ts src/utils/templateSync.test.ts tests/template-sync-integration.test.ts
git commit -m "remove legacy name-based bootstrap, all cards now require templateBenefitId"
```

---

### Task 11: Final lint, type check, and full verification

**Files:** None (verification only)

- [ ] **Step 1: Run linter**

Run: `npm run lint`
Expected: no errors

- [ ] **Step 2: Run type checker**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Run full test suite**

Run: `npm run test`
Expected: all tests pass

- [ ] **Step 4: Verify no test files exceed line limits**

Check that `src/utils/templateSync.ts` and `src/utils/templateSync.test.ts` are each under 1000 lines.

- [ ] **Step 5: Final commit if any lint fixes were needed**

```bash
git add -A
git commit -m "fix lint issues from template versioning implementation"
```
