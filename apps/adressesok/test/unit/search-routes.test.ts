import { describe, expect, test } from "bun:test";
import pino from "pino";
import { Registry } from "prom-client";
import { createApp } from "../../src/app";
import type { ManagedSearchResult } from "../../src/managed-elasticsearch";

const logger = pino({ enabled: false });

describe("managed search routes", () => {
  test("/sok builds a query against the new ES9 field names and maps the response", async () => {
    let capturedQuery: unknown;
    const managedElasticsearch = {
      isReady: async () => true,
      search: async (body: { query?: unknown }) => {
        capturedQuery = body.query;
        return {
          total: 1,
          hits: [
            {
              _source: {
                adressetekst: "Kartverksveien 2",
                kommunenummer: "3007",
                adressetype: "Vegadresse",
                poststed: "HØNEFOSS",
                oppdateringsdato: "2022-01-27T19:50:50.000Z",
                representasjonspunkt: { lat: 60.145187, lon: 10.2497 },
                adressekode: "123",
                bruksenhetsnummer: [],
              },
            },
          ],
        } as unknown as ManagedSearchResult;
      },
    };
    const app = createApp({
      managedElasticsearch,
      logger,
      registry: new Registry(),
    });

    const response = await app.request("/adresser/v1/sok?kommunenummer=3007&objtype=Vegadresse");
    expect(response.status).toBe(200);
    expect(capturedQuery).toEqual({
      bool: {
        must: [{ match: { kommunenummer: "3007" } }, { match: { adressetype: "Vegadresse" } }],
      },
    });
    const body = (await response.json()) as { adresser: Array<Record<string, unknown>> };
    expect(body.adresser).toEqual([
      expect.objectContaining({
        adressetekst: "Kartverksveien 2",
        kommunenummer: "3007",
        objtype: "Vegadresse",
        poststed: "HØNEFOSS",
        adressekode: 123,
      }),
    ]);
  });

  test("/sok searches on undernummer", async () => {
    let capturedQuery: unknown;
    const managedElasticsearch = {
      isReady: async () => true,
      search: async (body: { query?: unknown }) => {
        capturedQuery = body.query;
        return { total: 0, hits: [] };
      },
    };
    const app = createApp({
      managedElasticsearch,
      logger,
      registry: new Registry(),
    });

    const response = await app.request("/adresser/v1/sok?undernummer=1");
    expect(response.status).toBe(200);
    expect(capturedQuery).toEqual({ match: { undernummer: 1 } });
  });

  test("/sok treats an empty bokstav as addresses without a letter", async () => {
    let capturedQuery: unknown;
    const managedElasticsearch = {
      isReady: async () => true,
      search: async (body: { query?: unknown }) => {
        capturedQuery = body.query;
        return { total: 0, hits: [] };
      },
    };
    const app = createApp({
      managedElasticsearch,
      logger,
      registry: new Registry(),
    });

    const response = await app.request("/adresser/v1/sok?nummer=17&bokstav=");
    expect(response.status).toBe(200);
    expect(JSON.stringify(capturedQuery)).toContain('"must_not":{"exists":{"field":"bokstav"}}');
  });

  test("isReady depends on the managed Elasticsearch", async () => {
    const create = (ready: boolean) =>
      createApp({
        managedElasticsearch: {
          isReady: async () => ready,
          search: async () => ({ total: 0, hits: [] }),
        },
        logger,
        registry: new Registry(),
      });

    const up = await create(true).request("/adresser/v1/internal/isReady");
    expect(up.status).toBe(200);
    expect(await up.json()).toEqual({ status: "UP" });

    const down = await create(false).request("/adresser/v1/internal/isReady");
    expect(down.status).toBe(503);
    expect(await down.json()).toEqual({ status: "DOWN" });
  });

  test("/punktsok queries the managed Elasticsearch", async () => {
    let capturedBody: unknown;
    const app = createApp({
      managedElasticsearch: {
        isReady: async () => true,
        search: async (body) => {
          capturedBody = body;
          return { total: 0, hits: [] };
        },
      },
      logger,
      registry: new Registry(),
    });

    const response = await app.request("/adresser/v1/punktsok?lat=60&lon=10&radius=100");
    expect(response.status).toBe(200);
    expect(capturedBody).toHaveProperty("sort");
  });

  test("does not expose the old /internal/sok and /internal/punktsok routes", async () => {
    const app = createApp({
      managedElasticsearch: {
        isReady: async () => true,
        search: async () => ({ total: 0, hits: [] }),
      },
      logger,
      registry: new Registry(),
    });

    expect((await app.request("/adresser/v1/internal/sok?kommunenummer=3007")).status).toBe(404);
    expect(
      (await app.request("/adresser/v1/internal/punktsok?lat=60&lon=10&radius=1")).status,
    ).toBe(404);
  });
});
