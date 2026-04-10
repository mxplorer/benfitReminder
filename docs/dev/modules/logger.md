# Logger Module

## Overview

Structured logging via `createLogger()`. All application code uses this instead of bare `console.log`.

## Usage

```ts
import { createLogger } from "../lib/logger";
const log = createLogger("store.cards");

log.info("card added", { cardId: "amex-gold" });
log.debug("period calc", { start, end }); // gated by level
```

## LogEntry Shape

```ts
{ level: "debug"|"info"|"warn"|"error", module: string, message: string, data?: Record<string, unknown>, timestamp: number }
```

## Level Guidelines

| Level | Use for | Example |
|-------|---------|---------|
| debug | Calculation intermediates, state diffs | Period range boundaries |
| info | One per user action max | Benefit checked off |
| warn | Recoverable issues | JSON parse fallback |
| error | Unrecoverable failures | Store hydration failure |

## Configuration

- `setGlobalMinLevel(level)` — set floor for all loggers
- `setGlobalTransports([...])` — set transports for loggers without local overrides
- Per-logger overrides via `createLogger("mod", { minLevel, transports })`
