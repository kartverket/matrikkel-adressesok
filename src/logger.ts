import pino, { type Logger } from "pino";
import type { AppConfig } from "./config";

export function createLogger(config: Pick<AppConfig, "logLevel">): Logger {
  return pino({
    level: config.logLevel,
    base: null,
    messageKey: "message",
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (level) => ({ level: level.toUpperCase() }),
    },
  });
}
