# Task 01: Scaffold Tauri v2 + React + Vite

## Goal
Create the project skeleton with all dependencies installed and Vitest configured.

## Files
- Create: project root via `npm create tauri-app@latest`
- Modify: `package.json` — add Zustand, Vitest, React Testing Library
- Modify: `src-tauri/Cargo.toml` — add Tauri plugin crates
- Modify: `vite.config.ts` — configure Vitest
- Create: `src/test-setup.ts`

## Requirements

1. **Scaffold** with `npm create tauri-app@latest` — template: react-ts, manager: npm
2. **Frontend deps**: `zustand`, `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom`
3. **Tauri plugins**: `tauri-plugin-notification`, `tauri-plugin-dialog`, `tauri-plugin-fs`, `tauri-plugin-autostart`
4. **Vitest config**: globals: true, environment: jsdom, setupFiles: `./src/test-setup.ts`, css: false
5. **Test setup**: imports `@testing-library/jest-dom/vitest`
6. **Scripts**: `test`, `test:watch`, `test:coverage`

## Acceptance Criteria
- [ ] `npm run test` exits cleanly (no tests found)
- [ ] `npm run dev` starts Vite dev server + Tauri window
- [ ] All deps listed in package.json / Cargo.toml
- [ ] Commit: `scaffold Tauri v2 + React + TypeScript project with Vitest`

## Dev Docs
After this task, create `docs/dev/architecture.md` with initial project structure overview.
