# Task 02: Configure ESLint v9 + Prettier

## Goal
Set up linting and formatting to enforce code standards from CLAUDE.md.

## Files
- Create: `eslint.config.js` (ESLint v9 flat config, NOT legacy `.eslintrc`)
- Create: `.prettierrc`, `.prettierignore`
- Modify: `package.json` (lint/format scripts)

## Requirements

1. **ESLint v9 flat config** using `typescript-eslint` with `strictTypeChecked`
2. **Plugins**: `react-hooks`, `react-refresh`, `eslint-config-prettier`
3. **Key rules**: `no-explicit-any: "error"`, `consistent-type-imports: "error"`, unused vars with `_` ignore pattern
4. **Prettier**: semi, double quotes, trailing comma all, printWidth 100, tabWidth 2
5. **Ignore**: `dist`, `src-tauri`, `node_modules`
6. **Scripts**: `lint`, `lint:fix`, `format`

## Acceptance Criteria
- [ ] `npm run lint` passes with no errors
- [ ] `npm run format` formats all src files
- [ ] Commit: `configure ESLint v9 flat config + Prettier`
