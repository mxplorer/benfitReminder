export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  level: LogLevel;
  module: string;
  message: string;
  data?: Record<string, unknown>;
  timestamp: number;
}

export interface LogTransport {
  write(entry: LogEntry): void;
}

export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let globalTransports: LogTransport[] = [];
let globalMinLevel: LogLevel = "debug";

export const setGlobalTransports = (transports: LogTransport[]): void => {
  globalTransports = transports;
};

export const setGlobalMinLevel = (level: LogLevel): void => {
  globalMinLevel = level;
};

interface CreateLoggerOptions {
  transports?: LogTransport[];
  minLevel?: LogLevel;
}

export const createLogger = (module: string, options?: CreateLoggerOptions): Logger => {
  const emit = (level: LogLevel, message: string, data?: Record<string, unknown>): void => {
    const effectiveMinLevel = options?.minLevel ?? globalMinLevel;
    if (LEVEL_ORDER[level] < LEVEL_ORDER[effectiveMinLevel]) return;

    const entry: LogEntry = {
      level,
      module,
      message,
      data,
      timestamp: Date.now(),
    };

    const transports =
      options?.transports && options.transports.length > 0 ? options.transports : globalTransports;
    for (const transport of transports) {
      transport.write(entry);
    }
  };

  return {
    debug: (message, data) => {
      emit("debug", message, data);
    },
    info: (message, data) => {
      emit("info", message, data);
    },
    warn: (message, data) => {
      emit("warn", message, data);
    },
    error: (message, data) => {
      emit("error", message, data);
    },
  };
};
