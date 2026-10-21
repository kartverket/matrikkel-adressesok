import { Registry } from "prom-client";
import { createApp } from "./app";
import { loadConfig } from "./config";
import { ElasticsearchClient } from "./elasticsearch";
import { createLogger } from "./logger";
import { ManagedElasticsearchClient } from "./managed-elasticsearch";

const registry = new Registry();
const config = loadConfig();
const logger = createLogger({ level: config.logLevel });
const elasticsearch = new ElasticsearchClient(config, logger);
const managedElasticsearch = new ManagedElasticsearchClient(config.managedElasticSearch, logger);
const app = createApp({ elasticsearch, managedElasticsearch, logger, registry });

logger.info({ port: config.port }, `Starting address API at ${config.port}`);

Bun.serve({
  port: config.port,
  fetch: app.fetch,
});
