import { structuredLogger } from "@hono/structured-logger";
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

const startTimeKey = "startTime";

function logLevelForStatus(status: number): "info" | "warn" | "error" {
  if (status >= 500) return "error";
  if (status >= 400) return "warn";
  return "info";
}

export function createStructuredHonoLogger(logger: Logger, internalPath: string) {
  return structuredLogger({
    createLogger: () => logger,
    onResponse: (logger, c, elapsedMs) => {
      if (c.req.path.startsWith(internalPath)) return;

      const durationMs = Math.round(elapsedMs * 100) / 100;
      const status = c.res.status;
      logger[logLevelForStatus(status)]({
        status,
        method: c.req.method,
        path: c.req.path,
        query: c.req.queries(),
        message: `${c.req.method} ${c.req.path} ${c.res.status} ${durationMs}ms`,
        duration_ms: durationMs,
      });
    },
    onError: (logger, err, c, elapsedMs) => {
      const durationMs = Math.round(elapsedMs * 100) / 100;
      const status = c.res.status;
      logger[logLevelForStatus(status)]({
        status,
        method: c.req.method,
        path: c.req.path,
        query: c.req.queries(),
        message: `${c.req.method} ${c.req.path} ${c.res.status} ${durationMs}ms`,
        duration_ms: durationMs,
        err: { message: err.message, stack: err.stack },
      });
    },
  });
}
