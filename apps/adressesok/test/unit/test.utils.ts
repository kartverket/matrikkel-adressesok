import pino from "pino";
import { Registry } from "prom-client";
import { createApp } from "../../src/app";
import type { Elasticsearch } from "../../src/elasticsearch";

const logger = pino({ enabled: false });

export function appWith(elasticsearch: Elasticsearch) {
  return createApp({ elasticsearch, logger, registry: new Registry() });
}

/**
 * Som appWith, men fanger opp alt som logges slik at tester kan verifisere
 * hvilket nivå (info/warn/error) faktiske request/response-logger havner på.
 */
export function appWithCapturedLogs(elasticsearch: Elasticsearch) {
  const entries: Record<string, unknown>[] = [];
  const capturingLogger = pino(
    {
      level: "info",
      messageKey: "message",
      formatters: { level: (label: string) => ({ level: label.toUpperCase() }) },
    },
    { write: (line: string) => entries.push(JSON.parse(line)) },
  );
  const app = createApp({ elasticsearch, logger: capturingLogger, registry: new Registry() });
  return { app, entries };
}
