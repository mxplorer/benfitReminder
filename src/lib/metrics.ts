export interface MetricEvent {
  name: string;
  type: "count" | "gauge" | "timing";
  value: number;
  tags?: Record<string, string>;
  timestamp: number;
}

export interface MetricsCollector {
  count(name: string, tags?: Record<string, string>): void;
  gauge(name: string, value: number, tags?: Record<string, string>): void;
  timing(name: string, durationMs: number, tags?: Record<string, string>): void;
}

export class LocalMetricsCollector implements MetricsCollector {
  constructor(private readonly sink: (event: MetricEvent) => void) {}

  count(name: string, tags?: Record<string, string>): void {
    this.sink({ name, type: "count", value: 1, tags, timestamp: Date.now() });
  }

  gauge(name: string, value: number, tags?: Record<string, string>): void {
    this.sink({ name, type: "gauge", value, tags, timestamp: Date.now() });
  }

  timing(name: string, durationMs: number, tags?: Record<string, string>): void {
    this.sink({ name, type: "timing", value: durationMs, tags, timestamp: Date.now() });
  }
}
