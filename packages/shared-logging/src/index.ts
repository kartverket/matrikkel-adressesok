import pino, { type LevelWithSilent, type Logger } from "pino";

export type { Logger } from "pino";

export interface CreateLoggerOptions {
  level?: LevelWithSilent;
  base?: Record<string, unknown> | null;
}

function serialiserFeilKortfattet(e: Error) {
  return { type: e.name, message: e.message, stack: e.stack };
}

export function createLogger({ level, base = null }: CreateLoggerOptions = {}): Logger {
  return pino({
    ...(level !== undefined ? { level } : {}),
    base,
    messageKey: "message",
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (level: string) => ({ level: level.toUpperCase() }),
    },
    serializers: { err: serialiserFeilKortfattet },
  });
}
