# Task 13: CSS Theme System

## Goal
Create the design token system with automatic light/dark theme switching and frosted glass utilities.

## Files
- Create: `src/styles/theme.css` — design tokens as CSS custom properties
- Create: `src/styles/glass.css` — frosted glass utility classes
- Modify: `src/main.tsx` — import styles

## Requirements

### Design tokens (`theme.css`)
Define CSS custom properties on `:root` with `@media (prefers-color-scheme: dark)` override.

Tokens to define (see spec "Color System" for exact values):
- Colors: blue, green, orange, red (links/status)
- Text: primary, secondary, tertiary
- Backgrounds: panel, card, card-hover, sidebar, tab, tab-active
- Borders: card, subtle
- Tags: done-bg, danger-bg, warning-bg, safe-bg
- Shadows: card, card-hover, panel
- Font: SF Pro system font stack, -webkit-font-smoothing

### Frosted glass (`glass.css`)
Utility classes:
- `.glass-panel` — backdrop-filter blur for panels
- `.glass-card` — card background with border and shadow
- `.glass-card:hover` — lift effect (translateY -2px) with deeper shadow
- `.glass-card.urgent` — red accent
- `.glass-card.used` — dimmed (opacity 0.5)
- `.glass-card.hidden-benefit` — very dim (opacity 0.35)

## Acceptance Criteria
- [ ] `npm run dev` shows app without CSS errors
- [ ] Light and dark tokens both defined
- [ ] Commit: `add CSS theme system with light/dark design tokens and glass utilities`
