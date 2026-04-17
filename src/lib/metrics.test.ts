import { describe, it, expect, vi } from "vitest";
import type { MetricEvent } from "./metrics";
import { LocalMetricsCollector } from "./metrics";

describe("LocalMetricsCollector", () => {
  it("records count events with value 1", () => {
    const sink = vi.fn<(event: MetricEvent) => void>();
    const collector = new LocalMetricsCollector(sink);

    collector.count("benefit.checked");

    expect(sink).toHaveBeenCalledOnce();
    const event = sink.mock.calls[0][0];
    expect(event.name).toBe("benefit.checked");
    expect(event.type).toBe("count");
    expect(event.value).toBe(1);
  });

  it("records gauge events with specified value", () => {
    const sink = vi.fn<(event: MetricEvent) => void>();
    const collector = new LocalMetricsCollector(sink);

    collector.gauge("cards.total", 5, { source: "store" });

    const event = sink.mock.calls[0][0];
    expect(event.type).toBe("gauge");
    expect(event.value).toBe(5);
    expect(event.tags).toEqual({ source: "store" });
  });

  it("records timing events with duration and timestamp", () => {
    const sink = vi.fn<(event: MetricEvent) => void>();
    const collector = new LocalMetricsCollector(sink);

    const before = Date.now();
    collector.timing("roi.calc", 42);
    const after = Date.now();

    const event = sink.mock.calls[0][0];
    expect(event.type).toBe("timing");
    expect(event.value).toBe(42);
    expect(event.timestamp).toBeGreaterThanOrEqual(before);
    expect(event.timestamp).toBeLessThanOrEqual(after);
  });
});
