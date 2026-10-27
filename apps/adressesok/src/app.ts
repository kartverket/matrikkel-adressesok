import { prometheus } from "@hono/prometheus";
import { swaggerUI } from "@hono/swagger-ui";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Logger } from "pino";
import type { Registry } from "prom-client";
import type { Elasticsearch } from "./elasticsearch";
import { HttpError, jsonResponse } from "./http";
import { createStructuredHonoLogger } from "./logger";
import type { ManagedElasticsearchClient } from "./managed-elasticsearch";
import { createManagedSearchBackend } from "./managed-search-backend";
import openapiSpec from "./openapi.json" with { type: "json" };
import { constructManagedQuery } from "./routes/internal-search";
import { registerPointSearchRoute } from "./routes/point-search";
import { registerSearchRoute } from "./routes/search";

export interface AppDependencies {
  elasticsearch: Elasticsearch;
  managedElasticsearch: Pick<ManagedElasticsearchClient, "isReady" | "search">;
  logger: Logger;
  registry: Registry;
}

const BASE_PATH = "/adresser/v1";

export function createApp({
  elasticsearch,
  managedElasticsearch,
  logger,
  registry,
}: AppDependencies): Hono {
  const app = new Hono().basePath(BASE_PATH);
  const { printMetrics, registerMetrics } = prometheus({
    collectDefaultMetrics: true,
    registry,
  });

  app.use("*", registerMetrics);
  app.use(
    createStructuredHonoLogger(
      logger,
      ["isAlive", "isReady", "metrics"].map((name) => `${BASE_PATH}/internal/${name}`),
    ),
  );
  app.use(
    "*",
    cors({
      origin: "*",
      allowMethods: ["GET", "OPTIONS"],
    }),
  );

  registerSearchRoute(app, elasticsearch, logger, registry);
  registerPointSearchRoute(app, elasticsearch, logger, registry);

  const managedSearchBackend = createManagedSearchBackend(managedElasticsearch);
  registerSearchRoute(app, managedSearchBackend, logger, registry, {
    path: "/internal/sok",
    queryBuilder: constructManagedQuery,
    metricName: "internal_sok_managed_query_duration_seconds",
    metricHelp: "Time used to execute sok queries against the managed (ES9) Elasticsearch cluster",
    logMessage: "Managed Elasticsearch query",
  });
  registerPointSearchRoute(app, managedSearchBackend, logger, registry, {
    path: "/internal/punktsok",
    metricName: "internal_punktsok_managed_query_duration_seconds",
    metricHelp:
      "Time used to execute punktsok queries against the managed (ES9) Elasticsearch cluster",
    logMessage: "Managed Elasticsearch geo query",
  });

  app.get("/openapi.json", (c) => c.json(openapiSpec));
  app.get("/docs.json", (c) => c.json(openapiSpec));

  const swagger = swaggerUI({
    url: `${BASE_PATH}/openapi.json`,
    title: "Adresser API - Swagger UI",
  });
  app.get("", swagger);
  app.get("/", swagger);
  app.get("/index.html", swagger);

  app.get("/internal/isAlive", (c) => c.json({ status: "UP" }));
  app.get("/internal/isReady", async (c) => {
    // Bevisst uten managedElasticsearch: /internal/* er ikke i produksjon ennå, og
    // nedetid på det nye clusteret skal ikke ta ned /sok.
    if (!(await elasticsearch.isReady())) return c.json({ status: "DOWN" }, 503);

    return c.json({ status: "UP" });
  });
  app.get("/internal/metrics", printMetrics);

  app.onError((error) => {
    if (error instanceof HttpError) {
      return jsonResponse(error.payload, error.status, true);
    }
    return jsonResponse({ message: "Internal Server Error" }, 500, true);
  });

  return app;
}
