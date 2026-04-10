# Task 03: Logging & Metrics Infrastructure

## Goal
Build the logging and metrics foundation that all subsequent code will use.

## Files
- Create: `src/lib/logger.ts`, `src/lib/logger.test.ts`
- Create: `src/lib/metrics.ts`, `src/lib/metrics.test.ts`
- Create: `src/lib/transports/console.ts`, `src/lib/transports/index.ts`

## Requirements

### Logger (`src/lib/logger.ts`)
- Export `createLogger(module: string, options?)` — returns `{ debug, info, warn, error }`
- Each method accepts `(message: string, data?: Record<string, unknown>)`
- `LogEntry` type: `{ level, module, message, data?, timestamp }`
- `LogTransport` interface: `{ write(entry: LogEntry): void }`
- Support per-logger and global transports, configurable min level
- Level order: debug(0) < info(1) < warn(2) < error(3) — entries below minLevel are dropped
- Export `setGlobalTransports()` and `setGlobalMinLevel()` for app-wide config

### Metrics (`src/lib/metrics.ts`)
- `MetricEvent` type: `{ name, type: "count"|"gauge"|"timing", value, tags?, timestamp }`
- `MetricsCollector` interface: `count(name, tags?)`, `gauge(name, value, tags?)`, `timing(name, durationMs, tags?)`
- `LocalMetricsCollector` class: takes a sink function `(event: MetricEvent) => void`

### Console Transport (`src/lib/transports/console.ts`)
- Pretty-prints log entries with color-coded level prefix
- Format: `[LEVEL][module] message {data}`

### Transport Init (`src/lib/transports/index.ts`)
- `initTransports({ logLevel, isDev })` — registers console transport in dev, returns metrics instance
- `getMetrics()` — returns initialized collector (throws if not init'd)

## Test Requirements
- Logger: creates with module name, sends entries to transports, respects min level, level ordering works
- Metrics: records count/gauge/timing events with correct type/value/tags, includes timestamps
- 8 tests total minimum

## Acceptance Criteria
- [ ] All 8+ tests pass
- [ ] Lint clean
- [ ] Commit: `add logging and metrics infrastructure with console transport`

## Dev Docs
Create `docs/dev/modules/logger.md` — document LogEntry shape, level guidelines, how to create module logger.
Create `docs/dev/modules/metrics.md` — document metric points table, how to instrument new metrics.
