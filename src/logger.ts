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
export function createStructuredHonoLogger(logger: Logger, internalPath: string) {
  return structuredLogger({
    createLogger: () => logger,
    onRequest: (logger, c) => {
      // Manually done since `onError` does not calculate elapsedMs automatically
      c.set(startTimeKey, performance.now());
    },
    onResponse: (logger, c, elapsedMs) => {
      if (c.req.path.startsWith(internalPath)) return;

      const durationMs = Math.round(elapsedMs * 100) / 100;
      logger.info({
        status: c.res.status,
        path: c.req.path,
        method: c.req.method,
        message: `${c.req.method} ${c.req.path} ${c.res.status} ${durationMs}ms`,
        duration_ms: durationMs,
      });
    },
    onError: (logger, err, c) => {
      const startTime = c.get(startTimeKey);
      const now = performance.now();
      // Safe fallback to prevent NaN while preserving real duration metrics
      const durationMs = now - (startTime ?? now);
      const duration = Math.round(durationMs * 100) / 100;
      logger.error({
        message: `${c.req.method} ${c.req.path} ${c.res.status} ${duration}ms`,
        err: { message: err.message, stack: err.stack },
        status: c.res.status,
        duration_ms: duration,
      });
    },
  });
}
