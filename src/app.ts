import { prometheus } from "@hono/prometheus";
import { swaggerUI } from "@hono/swagger-ui";
import { Hono } from "hono";
import { logger as requestLogger } from "hono/logger";
import type { Logger } from "pino";
import type { Elasticsearch } from "./elasticsearch";
import { HttpError, jsonResponse } from "./http";
import openapiSpec from "./openapi.json" with { type: "json" };
import { registerPointSearchRoute } from "./routes/point-search";
import { registerSearchRoute } from "./routes/search";

export interface AppDependencies {
  elasticsearch: Elasticsearch;
  logger: Logger;
}

const BASE_PATH = "/adresser/v1";

export function createApp({ elasticsearch, logger }: AppDependencies): Hono {
  const app = new Hono().basePath(BASE_PATH);
  const { printMetrics, registerMetrics } = prometheus({
    collectDefaultMetrics: true,
  });

  app.use("*", registerMetrics);
  app.use(
    "*",
    requestLogger((message) => logger.info(message)),
  );

  registerSearchRoute(app, elasticsearch, logger);
  registerPointSearchRoute(app, elasticsearch, logger);

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
    const ready = await elasticsearch.isReady();
    if (!ready) return c.json({ status: "DOWN" }, 503);

    return c.json({ status: "UP" });
  });
  app.get("/internal/metrics", printMetrics);

  app.onError((error) => {
    if (error instanceof HttpError) {
      logger.warn({ err: error, status: error.status }, "Request rejected");
      return jsonResponse(error.payload, error.status, true);
    }
    logger.error({ err: error }, "Unhandled request error");
    return jsonResponse({ message: "Internal Server Error" }, 500, true);
  });

  return app;
}
