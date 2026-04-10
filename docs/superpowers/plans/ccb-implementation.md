# Credit Card Benefits Tracker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a macOS menu bar + window app for tracking credit card benefit usage and analyzing ROI.

**Architecture:** Two-window Tauri app — tray popup for daily check-off, main window for management/analysis. Zustand store with JSON file persistence. Pure utility functions for period, ROI, and reminders.

**Tech Stack:** Tauri v2, React 19, TypeScript, Zustand, Vite, Vitest, React Testing Library, ESLint v9, Prettier

**Spec:** `docs/superpowers/specs/2026-04-09-credit-card-benefits-design.md`
**Rules:** `CLAUDE.md`
**Dev docs:** `docs/dev/` (created and updated during implementation)

---

## Documentation Strategy

Implementation produces two artifacts: **code** and **dev docs**.

| Level | Location | Content | When to update |
|-------|----------|---------|----------------|
| L1 | `docs/dev/architecture.md` | System overview, module map, data flow | After Phase 1 scaffold, on major changes |
| L2 | `docs/dev/modules/<name>.md` | Per-module: interface, design decisions, usage examples | When implementing or modifying a module |

Rules:
- Each module doc ≤ 500 lines. Split if larger.
- Document **interfaces and design decisions**, not implementation details that are obvious from code.
- Update the relevant doc in the same commit as the code change.
- Code comments: explain **why**, not **what**. Use inline comments sparingly.

---

## Task Index

### Phase 1: Project Setup & Foundation

| Task | File | Summary |
|------|------|---------|
| 01 | [01-scaffold.md](tasks/01-scaffold.md) | Scaffold Tauri v2 + React + Vite, install deps, configure Vitest |
| 02 | [02-eslint-prettier.md](tasks/02-eslint-prettier.md) | ESLint v9 flat config + Prettier |
| 03 | [03-logging-metrics.md](tasks/03-logging-metrics.md) | Logger, MetricsCollector, console transport |
| 04 | [04-type-definitions.md](tasks/04-type-definitions.md) | TypeScript types + `getCardDisplayName` helper |
| 05 | [05-card-templates.md](tasks/05-card-templates.md) | Built-in CardType templates (5 cards) |

### Phase 2: Core Business Logic (TDD)

| Task | File | Summary |
|------|------|---------|
| 06 | [06-period-ranges.md](tasks/06-period-ranges.md) | `getCurrentPeriodRange` for all reset types |
| 07 | [07-period-used-applicable.md](tasks/07-period-used-applicable.md) | `isBenefitUsedInPeriod` + `isApplicableNow` |
| 08 | [08-deadline.md](tasks/08-deadline.md) | `getDeadline` + `getDaysRemaining` |
| 09 | [09-roi.md](tasks/09-roi.md) | ROI calculation per card + dashboard aggregate |
| 10 | [10-reminder.md](tasks/10-reminder.md) | Reminder filtering logic |

### Phase 3: State Management

| Task | File | Summary |
|------|------|---------|
| 11 | [11-store-crud.md](tasks/11-store-crud.md) | Zustand store: card/benefit CRUD, usage toggle |
| 12 | [12-store-persistence.md](tasks/12-store-persistence.md) | Export/import, auto-recur generation |

### Phase 4: Theme & Shared Components

| Task | File | Summary |
|------|------|---------|
| 13 | [13-css-theme.md](tasks/13-css-theme.md) | Design tokens, light/dark, frosted glass |
| 14 | [14-shared-components.md](tasks/14-shared-components.md) | GlassContainer, CardChip, StatusTag, BenefitCard |

### Phase 5: Tray Panel

| Task | File | Summary |
|------|------|---------|
| 15 | [15-tray-container.md](tasks/15-tray-container.md) | TrayPanel with tab switching + dismiss |
| 16 | [16-tray-views.md](tasks/16-tray-views.md) | ByCardView + ByUrgencyView |

### Phase 6: Main Window

| Task | File | Summary |
|------|------|---------|
| 17 | [17-main-shell.md](tasks/17-main-shell.md) | Sidebar + routing + App.tsx window detection |
| 18 | [18-dashboard.md](tasks/18-dashboard.md) | ROI overview, period bar, per-card recovery |
| 19 | [19-card-detail.md](tasks/19-card-detail.md) | Benefits grid, filters, usage history |
| 20 | [20-editors.md](tasks/20-editors.md) | CardEditor + BenefitEditor forms |
| 21 | [21-settings-history.md](tasks/21-settings-history.md) | Settings + History views |

### Phase 7: Tauri Integration

| Task | File | Summary |
|------|------|---------|
| 22 | [22-multi-window.md](tasks/22-multi-window.md) | Tauri multi-window config + plugin registration |
| 23 | [23-tray-icon.md](tasks/23-tray-icon.md) | System tray icon + badge |
| 24 | [24-notifications.md](tasks/24-notifications.md) | System notification reminders |
| 25 | [25-file-persistence.md](tasks/25-file-persistence.md) | JSON file persistence via Tauri fs |

### Phase 8: Final

| Task | File | Summary |
|------|------|---------|
| 26 | [26-e2e-verification.md](tasks/26-e2e-verification.md) | Full test suite + manual smoke test |
