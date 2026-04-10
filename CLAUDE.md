# Credit Card Benefits Tracker

## Tech Stack
- Tauri v2 + React + TypeScript + Zustand + Vite
- Testing: Vitest + React Testing Library
- Linting: ESLint v9 (flat config) + Prettier
- Rust: Clippy (default warnings)

## Code Rules

### File Size
- Maximum 1000 lines per file. If a file approaches this limit, refactor by extracting logical units into separate files before continuing.

### Linting & Formatting

**Frontend (TypeScript/React):**
- ESLint v9 with flat config (`eslint.config.js`), NOT legacy `.eslintrc`
- Use `@typescript-eslint/eslint-plugin` with type-aware rules enabled
- Prettier for formatting only — use `eslint-config-prettier` to disable conflicting ESLint format rules
- No `any` types — use `@typescript-eslint/no-explicit-any: "error"`
- Enforce consistent imports with `@typescript-eslint/consistent-type-imports`
- Run `npm run lint` before committing and fix all errors

**Rust (src-tauri):**
- Run `cargo clippy -- -D warnings` before committing
- All clippy warnings are treated as errors
- Minimal custom Rust code expected — mostly Tauri plugin configuration

### Testing

Use Vitest for all tests, React Testing Library for component tests.

**Layer 1 — Pure logic unit tests (REQUIRED, highest priority):**
- `utils/period.ts`: Test every `resetType` with boundary cases:
  - calendar: month-end, quarter-end, H1/H2 switch, year-end, applicableMonths filtering
  - anniversary: cross-year, leap year, open date = today
  - since_last_use: cooldown exact expiry, mid-cooldown, no prior records
  - subscription: autoRecur on/off behavior
  - every_4_years: block boundaries
  - one_time: with/without expiresDate, used vs unused, expired vs active
- `utils/roi.ts`: membership year range calculation, cross-year open dates, faceValue snapshot accuracy, zero-record edge case
- `utils/reminder.ts`: deadline computation per reset type, reminder trigger threshold, hidden/autoRecur exclusion
- Pure functions must have 100% branch coverage. Every `if`, every `switch case`, every edge.

**Layer 2 — Store integration tests (REQUIRED):**
- Every Zustand action must have a test verifying state before and after
- Test sequences: add card → add benefit → toggle usage → verify usageRecord fields (including faceValue snapshot)
- Test hidden benefit exclusion from unused count
- Test subscription autoRecur record generation
- Test JSON round-trip: save → load → assert deep equality
- Test import validation: reject malformed JSON, preserve existing data on failure

**Layer 3 — Component interaction tests (REQUIRED for user-facing flows):**
- Benefit check-off: click → store updated → UI reflects change
- Tray view switching: tab toggle → correct list content and sort order
- Filter pills: each filter → correct subset displayed
- Card/benefit editor: form submit → data persisted correctly
- Do NOT test pure styling or layout — only behavior and data flow

**Test file organization:**
- **Unit tests**: colocated with source files, e.g. `src/utils/period.ts` → `src/utils/period.test.ts`
  - Tests individual functions, components, or modules in isolation
- **Integration / E2E tests**: in `tests/` directory at project root
  - Tests cross-module interactions, full user flows, multi-component scenarios
  - Mirror source structure when helpful, e.g. `tests/store-persistence.test.ts`

**Build exclusion:**
- Production build uses `tsconfig.build.json` which excludes `*.test.ts`, `test-setup.ts`, and `tests/`
- Vite only bundles files reachable from the entry point import chain — test files are never imported by source, so they are excluded from the bundle automatically

**Test discipline:**
- Write tests BEFORE or alongside implementation, not after
- All tests must pass before committing. Run `npm run test` first.
- When fixing a bug, add a regression test that reproduces the bug BEFORE writing the fix
- Use descriptive test names: `it("returns deadline as June 30 for H1 semi-annual benefit in April")`

### Commits
- Do not commit if tests or lint fail. Fix first, then commit.
- Each commit should be a logical unit of work with passing tests and clean lint.
- Commit message: concise and accurate, one line, describe WHAT changed and WHY (e.g. "add period deadline calculation for calendar benefits")
- Maximum 500 lines of non-test code changes per commit. If a feature requires more, break it into smaller commits. Test files are excluded from this count.
- If a commit is getting too large, stop and split the work into logical chunks.

### Code Style
- Prefer named exports over default exports
- Use `const` arrow functions for React components
- Keep components focused — one component per file
- Unit tests colocated: `foo.ts` → `foo.test.ts`; integration/E2E tests in `tests/`

### Logging
- Use `createLogger("module.name")` from `src/lib/logger.ts` for all logging
- **debug**: calculation intermediates, state diffs, branch decisions — dev only, gated by level
- **info**: one per user action maximum (benefit checked, card added, data exported)
- **warn**: recoverable issues (JSON parse fallback, notification permission denied)
- **error**: unrecoverable (data file corrupt, store hydration failure)
- Use `metrics.count()` / `metrics.timing()` from `src/lib/metrics.ts` for instrumentation
- Never use bare `console.log` — always go through the logger

### Documentation
- **Update docs alongside code** — each commit that changes module behavior should update the corresponding doc
- **Code comments**: explain **why**, not **what**. Inline comments sparingly.
- Dev docs live in `docs/dev/`:
  - `architecture.md` — system overview, module map (L1)
  - `modules/<name>.md` — per-module interface, design decisions, usage (L2)
- Each doc file ≤ 500 lines. Split if larger.

## Project Structure
```
src/                        # Frontend (React + TypeScript)
src/lib/                    # Infrastructure (logger, metrics, transports)
src/models/                 # Type definitions + card templates
src/utils/                  # Pure business logic (period, roi, reminder)
src/stores/                 # Zustand state management
src/views/tray/             # Tray panel components
src/views/main/             # Main window components
src/views/shared/           # Shared UI components
src/tauri/                  # Tauri API wrappers (tray, notifications, fs)
src/styles/                 # CSS theme + glass utilities
src-tauri/                  # Backend (Rust, Tauri framework)
tests/                      # Integration / E2E tests
docs/superpowers/specs/     # Design specs
docs/superpowers/plans/     # Implementation plan (index + per-task files)
docs/dev/                   # Developer documentation (L1: architecture, L2: modules)
```
- Design spec: `docs/superpowers/specs/2026-04-09-credit-card-benefits-design.md`
- Implementation plan: `docs/superpowers/plans/ccb-implementation.md` (index → `tasks/*.md`)
