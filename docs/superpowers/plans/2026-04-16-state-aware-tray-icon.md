# State-Aware Tray Icon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static tray icon with a state-aware monochrome template image that shows a colored dot (yellow/red) when benefits are unused or approaching their deadline, and install a distinct brand icon for the desktop app.

**Architecture:** A pure frontend function (`computeTrayStatus`) derives a `clean | unused | urgent` state from cards + `reminderDays`. Any store change fires a subscription that invokes a Rust command; Rust swaps the tray icon between three preloaded PNGs. Desktop app icon is regenerated once from a user-supplied logo via the standard Tauri icon tooling.

**Tech Stack:** TypeScript / React 19 / Zustand (frontend), Tauri v2 / Rust (backend), Vitest + React Testing Library (tests), `sharp` (build script for compositing the colored dot).

**Design spec:** `docs/superpowers/specs/2026-04-16-state-aware-tray-icon-design.md`

---

## File Map

**Create:**
- `src/utils/trayState.ts` — pure state computation
- `src/utils/trayState.test.ts` — unit tests
- `tests/tray-status-integration.test.ts` — store-level integration tests
- `scripts/build-tray-icons.mjs` — composites the status dot onto the line-art source
- `assets/brand/README.md` — notes on what source images live here and how they're consumed
- `src-tauri/icons/tray/tray-clean@1x.png` through `tray-urgent@2x.png` — 6 generated files

**Modify:**
- `src/tauri/tray.ts` — replace `updateTrayBadge` with `updateTrayStatus`
- `src/views/main/MainWindow.tsx` — update the subscription callsite
- `src-tauri/src/lib.rs` — replace `update_tray_badge` with `update_tray_status`, preload icons
- `src-tauri/icons/*.png` / `icon.icns` / `icon.ico` — regenerated from user's brand PNG
- `package.json` — add `sharp` as devDependency + `build:tray-icons` script

**User-supplied source assets (drop in before starting the relevant tasks):**
- `assets/brand/ccb-logo-1024.png` — 1024×1024, blue background, white line art (Task 3)
- `assets/brand/tray-source-1024.png` — 1024×1024, transparent background, black line art (Task 4)

---

## Task 1: Pure `computeTrayStatus` function (TDD)

**Files:**
- Create: `src/utils/trayState.ts`
- Create: `src/utils/trayState.test.ts`

Computes the tray state from the current cards, `today`, and `reminderDays`. Reuses `getBenefitsDueForReminder` for the urgent set and the same filters for the unused set.

- [ ] **Step 1: Write the failing tests**

Create `src/utils/trayState.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { Benefit, CreditCard } from "../models/types";
import { computeTrayStatus } from "./trayState";

const d = (iso: string) => new Date(iso + "T00:00:00");

const makeBenefit = (overrides: Partial<Benefit> = {}): Benefit => ({
  id: "b1",
  name: "Test Benefit",
  description: "",
  faceValue: 100,
  category: "other",
  resetType: "calendar",
  resetConfig: { period: "monthly" },
  isHidden: false,
  rolloverable: false,
  rolloverMaxYears: 2,
  usageRecords: [],
  ...overrides,
});

const makeCard = (
  benefits: Benefit[],
  overrides: Partial<CreditCard> = {},
): CreditCard => ({
  id: "card-1",
  owner: "Test",
  cardTypeSlug: "amex_platinum",
  annualFee: 895,
  cardOpenDate: "2024-03-15",
  color: "#8E9EAF",
  isEnabled: true,
  benefits,
  ...overrides,
});

describe("computeTrayStatus", () => {
  it("returns clean with no cards", () => {
    expect(computeTrayStatus([], d("2026-04-16"), 3)).toEqual({
      state: "clean",
      unusedCount: 0,
      urgentCount: 0,
    });
  });

  it("returns clean when all cards are disabled", () => {
    const card = makeCard([makeBenefit()], { isEnabled: false });
    expect(computeTrayStatus([card], d("2026-04-16"), 3).state).toBe("clean");
  });

  it("returns clean when only benefits are hidden", () => {
    const card = makeCard([makeBenefit({ isHidden: true })]);
    expect(computeTrayStatus([card], d("2026-04-16"), 3).state).toBe("clean");
  });

  it("returns unused for applicable unused benefit outside reminder window", () => {
    // Quarterly benefit, Apr 16 → quarter ends Jun 30 → 75 days remaining
    const benefit = makeBenefit({
      resetConfig: { period: "quarterly" },
    });
    const card = makeCard([benefit]);
    const status = computeTrayStatus([card], d("2026-04-16"), 3);
    expect(status).toEqual({ state: "unused", unusedCount: 1, urgentCount: 0 });
  });

  it("returns urgent when a benefit is inside the reminder window", () => {
    // Monthly benefit, Apr 28 → deadline Apr 30 → 2 days remaining
    const benefit = makeBenefit();
    const card = makeCard([benefit]);
    const status = computeTrayStatus([card], d("2026-04-28"), 3);
    expect(status).toEqual({ state: "urgent", unusedCount: 1, urgentCount: 1 });
  });

  it("treats the exact boundary (daysRemaining == reminderDays) as urgent", () => {
    // Monthly benefit, Apr 27 → deadline Apr 30 → 3 days remaining, reminderDays=3
    const benefit = makeBenefit();
    const card = makeCard([benefit]);
    expect(computeTrayStatus([card], d("2026-04-27"), 3).state).toBe("urgent");
  });

  it("prefers urgent over unused when mixed", () => {
    // One quarterly (far out) + one monthly (urgent)
    const far = makeBenefit({ id: "far", resetConfig: { period: "quarterly" } });
    const near = makeBenefit({ id: "near" });
    const card = makeCard([far, near]);
    const status = computeTrayStatus([card], d("2026-04-28"), 3);
    expect(status).toEqual({ state: "urgent", unusedCount: 2, urgentCount: 1 });
  });

  it("returns clean when the only applicable benefit has been used this period", () => {
    const benefit = makeBenefit({
      usageRecords: [{ usedDate: "2026-04-05", faceValue: 100, actualValue: 100 }],
    });
    const card = makeCard([benefit]);
    expect(computeTrayStatus([card], d("2026-04-16"), 3).state).toBe("clean");
  });

  it("reminderDays = 0 only flags same-day deadlines as urgent", () => {
    const benefit = makeBenefit();
    const card = makeCard([benefit]);
    // Apr 29 with reminderDays=0 → 1 day remaining → still unused, not urgent
    expect(computeTrayStatus([card], d("2026-04-29"), 0).state).toBe("unused");
    // Apr 30 with reminderDays=0 → 0 days → urgent
    expect(computeTrayStatus([card], d("2026-04-30"), 0).state).toBe("urgent");
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npm run test -- src/utils/trayState.test.ts`
Expected: all tests fail with module-not-found error for `./trayState`.

- [ ] **Step 3: Implement `computeTrayStatus`**

Create `src/utils/trayState.ts`:

```ts
import type { CreditCard } from "../models/types";
import { isApplicableNow, isBenefitUsedInPeriod } from "./period";
import { getBenefitsDueForReminder } from "./reminder";

export type TrayState = "clean" | "unused" | "urgent";

export interface TrayStatus {
  state: TrayState;
  unusedCount: number;
  urgentCount: number;
}

/**
 * Derive the tray icon state from card data.
 * - `urgent` > `unused` > `clean` (priority).
 * - `unused` counts applicable + unused + not-hidden benefits on enabled cards.
 * - `urgent` is the subset of `unused` whose deadline is within `reminderDays` days.
 */
export const computeTrayStatus = (
  cards: CreditCard[],
  today: Date,
  reminderDays: number,
): TrayStatus => {
  const urgentItems = getBenefitsDueForReminder(cards, today, reminderDays);

  let unusedCount = 0;
  for (const card of cards) {
    if (!card.isEnabled) continue;
    for (const benefit of card.benefits) {
      if (benefit.isHidden) continue;
      if (!isApplicableNow(benefit, today)) continue;
      if (isBenefitUsedInPeriod(benefit, today, card.cardOpenDate, card.statementClosingDay)) {
        continue;
      }
      unusedCount++;
    }
  }

  const urgentCount = urgentItems.length;
  const state: TrayState =
    urgentCount > 0 ? "urgent" : unusedCount > 0 ? "unused" : "clean";

  return { state, unusedCount, urgentCount };
};
```

- [ ] **Step 4: Run tests and verify they pass**

Run: `npm run test -- src/utils/trayState.test.ts`
Expected: 9 tests pass.

- [ ] **Step 5: Run lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/utils/trayState.ts src/utils/trayState.test.ts
git commit -m "add computeTrayStatus for deriving tray icon state from cards"
```

---

## Task 2: Frontend wrapper + MainWindow callsite

**Files:**
- Modify: `src/tauri/tray.ts`
- Modify: `src/views/main/MainWindow.tsx` (lines 4, 36-41)

Replace `updateTrayBadge(count)` with `updateTrayStatus(status)`. Update the subscription in `MainWindow` to compute a `TrayStatus` and pass it through.

- [ ] **Step 1: Write the failing wrapper test**

Create `src/tauri/tray.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { updateTrayStatus } from "./tray";
import type { TrayStatus } from "../utils/trayState";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args: unknown) => invokeMock(cmd, args),
}));

describe("updateTrayStatus", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("no-ops outside Tauri (no __TAURI_INTERNALS__ on window)", async () => {
    const status: TrayStatus = { state: "urgent", unusedCount: 2, urgentCount: 1 };
    await updateTrayStatus(status);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("invokes update_tray_status with the full status when running in Tauri", async () => {
    // Simulate a Tauri runtime
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    invokeMock.mockResolvedValue(undefined);

    const status: TrayStatus = { state: "unused", unusedCount: 3, urgentCount: 0 };
    await updateTrayStatus(status);

    expect(invokeMock).toHaveBeenCalledWith("update_tray_status", {
      state: "unused",
      unusedCount: 3,
      urgentCount: 0,
    });

    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  });

  it("swallows invoke failures", async () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    invokeMock.mockRejectedValue(new Error("command missing"));
    const status: TrayStatus = { state: "clean", unusedCount: 0, urgentCount: 0 };
    await expect(updateTrayStatus(status)).resolves.toBeUndefined();
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- src/tauri/tray.test.ts`
Expected: fails — `updateTrayStatus` is not exported.

- [ ] **Step 3: Rewrite `src/tauri/tray.ts`**

Replace the whole file with:

```ts
import { createLogger } from "../lib/logger";
import type { TrayStatus } from "../utils/trayState";

const logger = createLogger("tauri.tray");

/**
 * Update the tray icon + tooltip to reflect the current benefit status.
 * No-ops gracefully when running outside Tauri (dev browser mode).
 */
export const updateTrayStatus = async (status: TrayStatus): Promise<void> => {
  if (!("__TAURI_INTERNALS__" in window)) return;

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("update_tray_status", {
      state: status.state,
      unusedCount: status.unusedCount,
      urgentCount: status.urgentCount,
    });
    logger.debug("Tray status updated", status);
  } catch {
    // Tauri command not available or failed
  }
};
```

- [ ] **Step 4: Run wrapper tests and verify they pass**

Run: `npm run test -- src/tauri/tray.test.ts`
Expected: 3 tests pass.

- [ ] **Step 5: Update MainWindow.tsx callsite**

Edit `src/views/main/MainWindow.tsx`:

Replace line 4:
```ts
import { updateTrayBadge } from "../../tauri/tray";
```
with:
```ts
import { updateTrayStatus } from "../../tauri/tray";
import { computeTrayStatus } from "../../utils/trayState";
```

Replace the `syncTray` function body (lines 36-41) with:
```ts
    const syncTray = () => {
      const { cards, settings, now } = useCardStore.getState();
      const status = computeTrayStatus(cards, now, settings.reminderDays);
      void updateTrayStatus(status);
      void checkAndSendReminders(cards, settings);
    };
```

- [ ] **Step 6: Run the existing MainWindow + store test suite**

Run: `npm run test`
Expected: all tests pass. The old `updateTrayBadge` has no other callers (verified — only MainWindow used it) and the store no longer needs `getUnusedBenefitCount` here.

- [ ] **Step 7: Run lint and typecheck**

Run: `npm run lint`
Then: `npm run build`
Expected: both succeed.

- [ ] **Step 8: Commit**

```bash
git add src/tauri/tray.ts src/tauri/tray.test.ts src/views/main/MainWindow.tsx
git commit -m "replace updateTrayBadge with updateTrayStatus and wire up MainWindow"
```

---

## Task 3: Store-level integration test

**Files:**
- Create: `tests/tray-status-integration.test.ts`

Verify that realistic sequences of store mutations produce the expected `TrayStatus` transitions.

- [ ] **Step 1: Write the integration test**

Create `tests/tray-status-integration.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { useCardStore } from "../src/stores/useCardStore";
import { computeTrayStatus } from "../src/utils/trayState";
import type { Benefit, CreditCard } from "../src/models/types";

const d = (iso: string) => new Date(iso + "T00:00:00");

const makeBenefit = (overrides: Partial<Benefit> = {}): Benefit => ({
  id: "b1",
  name: "Monthly Credit",
  description: "",
  faceValue: 25,
  category: "other",
  resetType: "calendar",
  resetConfig: { period: "monthly" },
  isHidden: false,
  rolloverable: false,
  rolloverMaxYears: 2,
  usageRecords: [],
  ...overrides,
});

const makeCard = (benefits: Benefit[]): CreditCard => ({
  id: "card-1",
  owner: "Test",
  cardTypeSlug: "amex_platinum",
  annualFee: 895,
  cardOpenDate: "2024-03-15",
  color: "#8E9EAF",
  isEnabled: true,
  benefits,
});

describe("tray status across store mutations", () => {
  beforeEach(() => {
    useCardStore.setState({
      cards: [],
      settings: {
        logLevel: "info",
        debugLogEnabled: false,
        reminderEnabled: true,
        reminderDays: 3,
        dismissedDate: null,
      },
      now: d("2026-04-16"),
    });
  });

  it("adding a card + unused benefit transitions clean → unused", () => {
    expect(
      computeTrayStatus(
        useCardStore.getState().cards,
        useCardStore.getState().now,
        useCardStore.getState().settings.reminderDays,
      ).state,
    ).toBe("clean");

    useCardStore.getState().addCard(makeCard([makeBenefit({ resetConfig: { period: "quarterly" } })]));

    expect(
      computeTrayStatus(
        useCardStore.getState().cards,
        useCardStore.getState().now,
        useCardStore.getState().settings.reminderDays,
      ).state,
    ).toBe("unused");
  });

  it("advancing now toward deadline transitions unused → urgent", () => {
    useCardStore.getState().addCard(makeCard([makeBenefit()]));
    useCardStore.setState({ now: d("2026-04-16") });
    expect(
      computeTrayStatus(
        useCardStore.getState().cards,
        useCardStore.getState().now,
        useCardStore.getState().settings.reminderDays,
      ).state,
    ).toBe("unused");

    useCardStore.setState({ now: d("2026-04-29") });
    expect(
      computeTrayStatus(
        useCardStore.getState().cards,
        useCardStore.getState().now,
        useCardStore.getState().settings.reminderDays,
      ).state,
    ).toBe("urgent");
  });

  it("toggling the benefit as used returns to clean", () => {
    useCardStore.getState().addCard(makeCard([makeBenefit()]));
    useCardStore.setState({ now: d("2026-04-29") });
    useCardStore.getState().toggleBenefitUsage("card-1", "b1");

    expect(
      computeTrayStatus(
        useCardStore.getState().cards,
        useCardStore.getState().now,
        useCardStore.getState().settings.reminderDays,
      ).state,
    ).toBe("clean");
  });

  it("changing reminderDays promotes unused → urgent without other mutations", () => {
    // Deadline is 10 days out
    useCardStore.getState().addCard(makeCard([makeBenefit({ resetConfig: { period: "quarterly" } })]));
    useCardStore.setState({ now: d("2026-06-21") }); // quarter ends Jun 30 → 9 days

    expect(
      computeTrayStatus(
        useCardStore.getState().cards,
        useCardStore.getState().now,
        3,
      ).state,
    ).toBe("unused");

    expect(
      computeTrayStatus(
        useCardStore.getState().cards,
        useCardStore.getState().now,
        14,
      ).state,
    ).toBe("urgent");
  });
});
```

- [ ] **Step 2: Run the test and verify it passes**

Run: `npm run test -- tests/tray-status-integration.test.ts`
Expected: 4 tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/tray-status-integration.test.ts
git commit -m "add integration tests for tray status across store mutations"
```

---

## Task 4: Desktop app icon (user-supplied)

**Files:**
- Create: `assets/brand/ccb-logo-1024.png` (user provides)
- Create: `assets/brand/README.md`
- Regenerate: everything under `src-tauri/icons/` that isn't inside `tray/`

**Prerequisite from user:** drop `ccb-logo-1024.png` (1024×1024, blue background, white card+bell line art) at `assets/brand/ccb-logo-1024.png` before running this task.

- [ ] **Step 1: Create the brand assets README**

Create `assets/brand/README.md`:

```markdown
# Brand Assets

Source artwork for app icons. These are inputs, not built artifacts — commit them as-is.

- `ccb-logo-1024.png` — 1024×1024 PNG. Blue background, white card+bell line art.
  Consumed by `npm run tauri icon` to generate the platform icons in `src-tauri/icons/`.
- `tray-source-1024.png` — 1024×1024 PNG. Transparent background, black card+bell line art.
  Consumed by `scripts/build-tray-icons.mjs` to generate `src-tauri/icons/tray/*.png`.
```

- [ ] **Step 2: Verify the logo file is in place**

Run: `ls -l assets/brand/ccb-logo-1024.png`
Expected: file exists at 1024×1024.

- [ ] **Step 3: Regenerate the full icon set**

Run: `npm run tauri icon assets/brand/ccb-logo-1024.png`
Expected: Tauri CLI reports writing icons to `src-tauri/icons/`. `icon.icns`, `icon.ico`, all `*.png` variants are updated.

- [ ] **Step 4: Confirm nothing outside the target directories was touched**

Run: `git status`
Expected: changes limited to `assets/brand/` and `src-tauri/icons/*.png|.icns|.ico` (the Android/iOS subdirs may also be regenerated; leave them).

- [ ] **Step 5: Commit**

```bash
git add assets/brand/ src-tauri/icons/
git commit -m "replace default Tauri icon with CCB brand logo"
```

---

## Task 5: Tray icon source, build script, generated PNGs

**Files:**
- Create: `assets/brand/tray-source-1024.png` (user provides)
- Create: `scripts/build-tray-icons.mjs`
- Modify: `package.json` (add `sharp` devDep + `build:tray-icons` script)
- Create: `src-tauri/icons/tray/tray-clean@1x.png`, `tray-clean@2x.png`, `tray-unused@1x.png`, `tray-unused@2x.png`, `tray-urgent@1x.png`, `tray-urgent@2x.png`

**Prerequisite from user:** drop `tray-source-1024.png` (1024×1024, transparent background, black line art) at `assets/brand/tray-source-1024.png` before running this task.

- [ ] **Step 1: Verify the tray source file is in place**

Run: `ls -l assets/brand/tray-source-1024.png`
Expected: file exists.

- [ ] **Step 2: Add `sharp` as a devDependency**

Run: `npm install --save-dev sharp@^0.33.0`
Expected: `sharp` appears in `package.json` `devDependencies`.

- [ ] **Step 3: Add the `build:tray-icons` script to `package.json`**

Edit `package.json` scripts block to include:
```json
"build:tray-icons": "node scripts/build-tray-icons.mjs",
```

- [ ] **Step 4: Write the build script**

Create `scripts/build-tray-icons.mjs`:

```js
#!/usr/bin/env node
// Composite the status dot onto the line-art source to produce 3 states × 2 sizes.
// Re-run this whenever `assets/brand/tray-source-1024.png` changes.

import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SOURCE = path.join(ROOT, "assets/brand/tray-source-1024.png");
const OUT_DIR = path.join(ROOT, "src-tauri/icons/tray");

// Dot geometry expressed relative to icon bounds, matching design spec section 5:
//   center at (17/22, 17/22), radius 4/22  (i.e. diameter 8/22)
const DOT_CENTER_FRAC = 17 / 22;
const DOT_RADIUS_FRAC = 4 / 22;

const STATES = [
  { name: "clean", dot: null },
  { name: "unused", dot: "#F5A623" },
  { name: "urgent", dot: "#E53935" },
];

const SIZES = [
  { suffix: "@1x", px: 22 },
  { suffix: "@2x", px: 44 },
];

const makeDotSvg = (size, color) => {
  if (!color) return null;
  const cx = DOT_CENTER_FRAC * size;
  const cy = DOT_CENTER_FRAC * size;
  const r = DOT_RADIUS_FRAC * size;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
       <circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" />
     </svg>`,
  );
};

await mkdir(OUT_DIR, { recursive: true });

for (const { name, dot } of STATES) {
  for (const { suffix, px } of SIZES) {
    const base = sharp(SOURCE).resize(px, px, { kernel: "lanczos3" });
    const svg = makeDotSvg(px, dot);
    const pipeline = svg
      ? base.composite([{ input: svg, top: 0, left: 0 }])
      : base;
    const outPath = path.join(OUT_DIR, `tray-${name}${suffix}.png`);
    await pipeline.png().toFile(outPath);
    console.log(`wrote ${path.relative(ROOT, outPath)}`);
  }
}
```

- [ ] **Step 5: Run the build script**

Run: `npm run build:tray-icons`
Expected: script prints 6 `wrote src-tauri/icons/tray/tray-*.png` lines. The six files exist.

- [ ] **Step 6: Sanity-check one of the generated files**

Run: `ls -l src-tauri/icons/tray/`
Expected: 6 files. `tray-urgent@2x.png` is a 44×44 PNG (verify by opening or via `file`).

- [ ] **Step 7: Commit**

```bash
git add assets/brand/tray-source-1024.png scripts/build-tray-icons.mjs package.json package-lock.json src-tauri/icons/tray/
git commit -m "add build-tray-icons script and generated tray PNG assets"
```

---

## Task 6: Rust backend — load icons and swap on command

**Files:**
- Modify: `src-tauri/src/lib.rs`

Replace `update_tray_badge` with `update_tray_status`. At setup time, load the 6 PNGs into memory via `include_bytes!` and keep handles on `AppHandle`-managed state. On the command, look up the right icon, call `tray.set_icon(...)`, and set the tooltip.

- [ ] **Step 1: Rewrite `src-tauri/src/lib.rs`**

Replace the file contents with:

```rust
use tauri::{
    image::Image,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, PhysicalPosition, Position, Rect, Size, State, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder, WindowEvent,
};

/// Preloaded tray icon variants. One set per state; sharp @2x variants are bundled
/// alongside @1x but we rely on Tauri + the OS to pick density, so we ship both and
/// Tauri handles the rest when passed a @2x Image with its natural density.
struct TrayIcons {
    clean: Image<'static>,
    unused: Image<'static>,
    urgent: Image<'static>,
}

impl TrayIcons {
    fn pick(&self, state: &str) -> &Image<'static> {
        match state {
            "urgent" => &self.urgent,
            "unused" => &self.unused,
            _ => &self.clean,
        }
    }
}

/// Update the tray icon + tooltip to reflect the current benefit status.
#[tauri::command]
fn update_tray_status(
    app: tauri::AppHandle,
    icons: State<'_, TrayIcons>,
    state: &str,
    unused_count: i32,
    urgent_count: i32,
) {
    let Some(tray) = app.tray_by_id("main-tray") else {
        return;
    };

    let _ = tray.set_icon(Some(icons.pick(state).clone()));

    let tooltip = match state {
        "urgent" => format!(
            "Credit Card Benefits · {unused_count} 项未使用（{urgent_count} 项即将到期）"
        ),
        "unused" => format!("Credit Card Benefits · {unused_count} 项未使用"),
        _ => "Credit Card Benefits · 全部已使用".to_string(),
    };
    let _ = tray.set_tooltip(Some(&tooltip));
}

/// Show / re-create the main window.
#[tauri::command]
fn show_main_window(app: tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.set_focus();
    } else if let Ok(win) = WebviewWindowBuilder::new(
        &app,
        "main",
        WebviewUrl::App("index.html".into()),
    )
    .title("Credit Card Benefits")
    .inner_size(1024.0, 768.0)
    .build()
    {
        let _ = win.set_focus();
    }
}

fn toggle_tray_panel(app: &tauri::AppHandle, icon_rect: Option<Rect>) {
    let Some(tray_win) = app.get_webview_window("tray") else {
        return;
    };
    if tray_win.is_visible().unwrap_or(false) {
        let _ = tray_win.hide();
        return;
    }
    if let Some(rect) = icon_rect {
        anchor_window_to_icon(&tray_win, rect);
    }
    let _ = tray_win.show();
    let _ = tray_win.set_focus();
}

fn anchor_window_to_icon(win: &WebviewWindow, icon_rect: Rect) {
    let scale = win.scale_factor().unwrap_or(1.0);
    let (icon_x, icon_y, icon_w, icon_h) = rect_to_physical(icon_rect, scale);
    let Ok(win_size) = win.outer_size() else { return };
    let win_w = f64::from(win_size.width);
    let x = icon_x + icon_w / 2.0 - win_w / 2.0;
    let y = icon_y + icon_h + 2.0;
    let _ = win.set_position(PhysicalPosition::new(x, y));
}

fn rect_to_physical(rect: Rect, scale: f64) -> (f64, f64, f64, f64) {
    let (x, y) = match rect.position {
        Position::Physical(p) => (f64::from(p.x), f64::from(p.y)),
        Position::Logical(p) => (p.x * scale, p.y * scale),
    };
    let (w, h) = match rect.size {
        Size::Physical(s) => (f64::from(s.width), f64::from(s.height)),
        Size::Logical(s) => (s.width * scale, s.height * scale),
    };
    (x, y, w, h)
}

/// Decode a PNG byte slice into a Tauri `Image<'static>`, panicking on malformed
/// bundled assets (they're generated by our build script, so a failure is a build bug).
fn load_icon(bytes: &'static [u8]) -> Image<'static> {
    Image::from_bytes(bytes).expect("bundled tray icon PNG must be valid")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let tray_icons = TrayIcons {
        clean: load_icon(include_bytes!("../icons/tray/tray-clean@2x.png")),
        unused: load_icon(include_bytes!("../icons/tray/tray-unused@2x.png")),
        urgent: load_icon(include_bytes!("../icons/tray/tray-urgent@2x.png")),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .manage(tray_icons)
        .invoke_handler(tauri::generate_handler![update_tray_status, show_main_window])
        .setup(|app| {
            if let Some(main_win) = app.get_webview_window("main") {
                let hide_target = main_win.clone();
                main_win.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = hide_target.hide();
                    }
                });
            }

            if let Some(tray_win) = app.get_webview_window("tray") {
                let hide_target = tray_win.clone();
                tray_win.on_window_event(move |event| {
                    if let WindowEvent::Focused(false) = event {
                        let _ = hide_target.hide();
                    }
                });
            }

            let quit_item = MenuItemBuilder::with_id("quit", "退出").build(app)?;
            let menu = MenuBuilder::new(app).item(&quit_item).build()?;

            // Initial icon is the `clean` variant; frontend will push the real state
            // right after hydration. `icon_as_template(true)` tells macOS to tint the
            // line art per menu-bar appearance — the colored dot remains full-color.
            let initial_icon = app.state::<TrayIcons>().clean.clone();
            TrayIconBuilder::with_id("main-tray")
                .icon(initial_icon)
                .icon_as_template(true)
                .tooltip("Credit Card Benefits")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    if event.id().as_ref() == "quit" {
                        app.exit(0);
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        rect,
                        ..
                    } = event
                    {
                        toggle_tray_panel(tray.app_handle(), Some(rect));
                    }
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 2: Run clippy**

Run: `cd src-tauri && cargo clippy -- -D warnings && cd ..`
Expected: clippy exits 0 with no warnings.

- [ ] **Step 3: Run a Rust type-check build (no bundling)**

Run: `cd src-tauri && cargo check && cd ..`
Expected: `cargo check` passes. Compile errors would most likely be: wrong `Image::from_bytes` signature or a missing `tauri::State` import — fix per compiler guidance.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "swap tray icon on update_tray_status with preloaded state variants"
```

---

## Task 7: End-to-end manual verification

**Files:** none (manual).

Because icon rendering is a visual + OS-integration concern, automate what's automatable (done in Tasks 1–3) and eyeball the rest.

- [ ] **Step 1: Start the dev build**

Run: `npm run tauri dev`
Expected: app launches; tray icon appears in the menu bar.

- [ ] **Step 2: Verify the `clean` baseline**

- Delete all cards (or start empty).
- Menu bar icon should be the line-art only, with **no dot**.
- On macOS: the line art should auto-invert when you switch the system appearance between light and dark (because `icon_as_template(true)` is set).
- Tooltip on hover: `Credit Card Benefits · 全部已使用`.

- [ ] **Step 3: Verify `unused` state**

- Add one card with a benefit that resets quarterly. Status should flip within a second of the add.
- Menu bar icon: line art + small **yellow** dot in the lower-right.
- Tooltip: `Credit Card Benefits · 1 项未使用`.

- [ ] **Step 4: Verify `urgent` state**

- Open the DevTools console on the main window (right-click → Inspect if enabled) OR use the Settings UI:
  - Set `reminderDays` to a value that brings one benefit into the window (e.g., 90).
- The dot should flip to **red** within a second.
- Tooltip: `Credit Card Benefits · N 项未使用（M 项即将到期）`.

- [ ] **Step 5: Verify the desktop app icon**

- Dock / taskbar / Finder "Get Info" should all show the new blue-background logo.

- [ ] **Step 6: If any visual is off (e.g., macOS recoloring the dot too)**

Template mode can recolor the dot if the alpha pattern makes it look like part of the glyph. If that happens:
- Bail out of template mode for `unused` and `urgent` variants: in `lib.rs`, add a `tray.set_icon_as_template(...)` call that is `false` when `state != "clean"` and `true` when `state == "clean"`.
- Re-run Step 3 and Step 4.

- [ ] **Step 7: Final test + lint sweep and commit**

Run: `npm run test && npm run lint && cd src-tauri && cargo clippy -- -D warnings && cd ..`
Expected: all green.

No commit needed for this task unless Step 6 triggered a code change — in which case:
```bash
git add src-tauri/src/lib.rs
git commit -m "bail out of template mode when a colored dot is shown"
```

---

## Self-review notes

**Spec coverage:**
- Desktop app icon → Task 4 ✓
- Three tray states (clean/unused/urgent) → Tasks 1, 5 ✓
- `reminderDays` binding → Task 1 ✓ (uses `getBenefitsDueForReminder`)
- State priority (urgent > unused > clean) → Task 1 logic + test ✓
- Tooltip variants → Task 6 ✓
- Asset layout → Tasks 4, 5 ✓
- Build script (dot compositing) → Task 5 ✓
- Layer 1 tests → Task 1 ✓
- Layer 2 tests → Task 3 ✓
- macOS template mode + fallback → Task 6 Step 1 + Task 7 Step 6 ✓

**Placeholder scan:** clean. Every step has concrete code or a concrete command with expected output.

**Type consistency:** `TrayStatus { state, unusedCount, urgentCount }` is defined once in Task 1 and used identically in Tasks 2, 3, and 6 (as `unused_count` / `urgent_count` per Rust naming). `invoke("update_tray_status", { state, unusedCount, urgentCount })` matches the Rust parameter names (Tauri auto-converts camelCase↔snake_case for command args).
