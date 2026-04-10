import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LogEntry, LogTransport } from "./logger";
import { createLogger, setGlobalTransports, setGlobalMinLevel } from "./logger";

const createMockTransport = (): LogTransport & { entries: LogEntry[] } => {
  const entries: LogEntry[] = [];
  return {
    entries,
    write: vi.fn((entry: LogEntry) => entries.push(entry)),
  };
};

describe("createLogger", () => {
  beforeEach(() => {
    setGlobalTransports([]);
    setGlobalMinLevel("debug");
  });

  it("creates a logger that includes the module name in entries", () => {
    const transport = createMockTransport();
    const log = createLogger("test.module", { transports: [transport] });

    log.info("hello");

    expect(transport.entries).toHaveLength(1);
    expect(transport.entries[0].module).toBe("test.module");
    expect(transport.entries[0].message).toBe("hello");
    expect(transport.entries[0].level).toBe("info");
  });

  it("sends entries to global transports when no local transports provided", () => {
    const transport = createMockTransport();
    setGlobalTransports([transport]);
    const log = createLogger("global.test");

    log.warn("global warning");

    expect(transport.entries).toHaveLength(1);
    expect(transport.entries[0].level).toBe("warn");
  });

  it("respects per-logger minLevel", () => {
    const transport = createMockTransport();
    const log = createLogger("filtered", { transports: [transport], minLevel: "warn" });

    log.debug("ignored");
    log.info("also ignored");
    log.warn("kept");
    log.error("also kept");

    expect(transport.entries).toHaveLength(2);
    expect(transport.entries[0].level).toBe("warn");
    expect(transport.entries[1].level).toBe("error");
  });

  it("respects global minLevel when no per-logger level set", () => {
    const transport = createMockTransport();
    setGlobalMinLevel("error");
    setGlobalTransports([transport]);
    const log = createLogger("global.level");

    log.info("dropped");
    log.error("kept");

    expect(transport.entries).toHaveLength(1);
    expect(transport.entries[0].level).toBe("error");
  });

  it("includes data and timestamp in log entries", () => {
    const transport = createMockTransport();
    const log = createLogger("data.test", { transports: [transport] });

    const before = Date.now();
    log.debug("with data", { key: "value" });
    const after = Date.now();

    expect(transport.entries[0].data).toEqual({ key: "value" });
    expect(transport.entries[0].timestamp).toBeGreaterThanOrEqual(before);
    expect(transport.entries[0].timestamp).toBeLessThanOrEqual(after);
  });
});
