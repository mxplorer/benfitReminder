import type { LogEntry, LogTransport } from "../logger";

const LEVEL_COLORS: Record<string, string> = {
  debug: "\x1b[36m",
  info: "\x1b[32m",
  warn: "\x1b[33m",
  error: "\x1b[31m",
};

const RESET = "\x1b[0m";

export class ConsoleTransport implements LogTransport {
  write(entry: LogEntry): void {
    const color = LEVEL_COLORS[entry.level] ?? "";
    const prefix = `${color}[${entry.level.toUpperCase()}]${RESET}[${entry.module}]`;
    const dataStr = entry.data ? ` ${JSON.stringify(entry.data)}` : "";
    const output = `${prefix} ${entry.message}${dataStr}`;

    switch (entry.level) {
      case "debug":
        console.debug(output);
        break;
      case "info":
        console.info(output);
        break;
      case "warn":
        console.warn(output);
        break;
      case "error":
        console.error(output);
        break;
    }
  }
}
