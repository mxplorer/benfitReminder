# Metrics Module

## Overview

Lightweight instrumentation via `MetricsCollector`. Records count, gauge, and timing events.

## Usage

```ts
import { getMetrics } from "../lib/transports";
const metrics = getMetrics();

metrics.count("benefit.checked", { cardId: "amex-gold" });
metrics.timing("roi.calc", durationMs);
metrics.gauge("cards.total", store.cards.length);
```

## MetricEvent Shape

```ts
{ name: string, type: "count"|"gauge"|"timing", value: number, tags?: Record<string, string>, timestamp: number }
```

## Initialization

Call `initTransports({ logLevel, isDev })` at app startup. This configures both logging transports and the metrics collector. Use `getMetrics()` afterwards to retrieve the singleton.
