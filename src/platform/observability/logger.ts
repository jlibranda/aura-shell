export type LogLevel = "info" | "warn" | "error";

export interface LogFields {
  requestId?: string;
  correlationId?: string;
  component?: string;
  operation?: string;
  durationMs?: number;
  errorCode?: string;
  [key: string]: unknown;
}

export interface LogEntry extends LogFields {
  timestamp: string;
  level: LogLevel;
  message: string;
}

function write(level: LogLevel, message: string, fields: LogFields = {}): void {
  const entry: LogEntry = { timestamp: new Date().toISOString(), level, message, ...fields };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/** Centralized structured JSON logger. One line per entry, safe for log aggregation. */
export const logger = {
  info: (message: string, fields?: LogFields) => write("info", message, fields),
  warn: (message: string, fields?: LogFields) => write("warn", message, fields),
  error: (message: string, fields?: LogFields) => write("error", message, fields),
};
