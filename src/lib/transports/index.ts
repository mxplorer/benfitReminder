import type { LogLevel } from "../logger";
import { setGlobalMinLevel, setGlobalTransports } from "../logger";
import type { MetricsCollector } from "../metrics";
import { LocalMetricsCollector } from "../metrics";
import { ConsoleTransport } from "./console";

let metricsInstance: MetricsCollector | null = null;

interface InitOptions {
  logLevel: LogLevel;
  isDev: boolean;
}

export const initTransports = ({ logLevel, isDev }: InitOptions): MetricsCollector => {
  setGlobalMinLevel(logLevel);

  if (isDev) {
    setGlobalTransports([new ConsoleTransport()]);
  }

  metricsInstance = new LocalMetricsCollector((event) => {
    if (isDev) {
      console.debug(`[METRIC] ${event.type}:${event.name} = ${String(event.value)}`, event.tags);
    }
  });

  return metricsInstance;
};

export const getMetrics = (): MetricsCollector => {
  if (!metricsInstance) {
    throw new Error("Metrics not initialized. Call initTransports() first.");
  }
  return metricsInstance;
};
