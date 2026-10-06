import pino from "pino";
import { Registry } from "prom-client";
import { createApp } from "../../src/app";
import type { Elasticsearch } from "../../src/elasticsearch";

const logger = pino({ enabled: false });

export function appWith(elasticsearch: Elasticsearch) {
  return createApp({ elasticsearch, logger, registry: new Registry() });
}
