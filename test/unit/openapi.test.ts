import { describe, expect, test } from "bun:test";
import pino from "pino";
import { createApp } from "../../src/app";
import openapiSpec from "../../src/openapi.json" with { type: "json" };

const app = createApp({
  logger: pino({ enabled: false }),
  elasticsearch: {
    isReady: async () => true,
    search: async () => ({ total: 0, hits: [] }),
  },
});

describe("API documentation", () => {
  test("serves the supplied Swagger document", async () => {
    const response = await app.request("/adresser/v1/openapi.json");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(openapiSpec);
  });

  test("serves Swagger UI through the Hono middleware", async () => {
    const response = await app.request("/adresser/v1");
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("/adresser/v1/openapi.json");
  });

  test("does not expose documentation outside the base path", async () => {
    const response = await app.request("/openapi.json");
    expect(response.status).toBe(404);
  });
});
