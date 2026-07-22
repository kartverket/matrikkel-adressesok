import { Registry } from "prom-client";
import { createApp } from "./app";
import { loadConfig } from "./config";
import { ElasticsearchClient } from "./elasticsearch";
import { createLogger } from "./logger";

const registry = new Registry();
const config = loadConfig();
const logger = createLogger(config);
const elasticsearch = new ElasticsearchClient(config, logger);
const app = createApp({ elasticsearch, logger, registry });

logger.info({ port: config.port }, `Starting address API at ${config.port}`);

Bun.serve({
  port: config.port,
  fetch: app.fetch,
});
