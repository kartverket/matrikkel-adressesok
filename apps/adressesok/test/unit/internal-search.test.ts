import { describe, expect, test } from "bun:test";
import pino from "pino";
import { Registry } from "prom-client";
import { createApp } from "../../src/app";
import type { ElasticsearchSearchBody } from "../../src/elasticsearch";
import type { ManagedSearchResult } from "../../src/managed-elasticsearch";

const logger = pino({ enabled: false });

const elasticsearch = {
  isReady: async () => true,
  search: async () => ({ total: 0, hits: [] }),
};

describe("internal managed search routes", () => {
  test("/internal/sok builds a query against the new ES9 field names and maps the response", async () => {
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
      elasticsearch,
      managedElasticsearch,
      logger,
      registry: new Registry(),
    });

    const response = await app.request(
      "/adresser/v1/internal/sok?kommunenummer=3007&objtype=Vegadresse",
    );
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

  test("/internal/sok searches on undernummer", async () => {
    let capturedQuery: unknown;
    const managedElasticsearch = {
      isReady: async () => true,
      search: async (body: { query?: unknown }) => {
        capturedQuery = body.query;
        return { total: 0, hits: [] };
      },
    };
    const app = createApp({
      elasticsearch,
      managedElasticsearch,
      logger,
      registry: new Registry(),
    });

    const response = await app.request("/adresser/v1/internal/sok?undernummer=1");
    expect(response.status).toBe(200);
    expect(capturedQuery).toEqual({ match: { undernummer: 1 } });
  });

  test("isReady depends on the legacy Elasticsearch only", async () => {
    const managedElasticsearch = {
      isReady: async () => {
        throw new Error("isReady must not call the managed Elasticsearch client");
      },
      search: async () => ({ total: 0, hits: [] }),
    };
    const create = (legacyReady: boolean) =>
      createApp({
        elasticsearch: { ...elasticsearch, isReady: async () => legacyReady },
        managedElasticsearch,
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

  test("does not change today's /sok or /punktsok flow", async () => {
    let legacyQueryBody: ElasticsearchSearchBody | undefined;
    const legacyElasticsearch = {
      isReady: async () => true,
      search: async (body: ElasticsearchSearchBody) => {
        legacyQueryBody = body;
        return { total: 0, hits: [] };
      },
    };
    const managedElasticsearch = {
      isReady: async () => true,
      search: async () => {
        throw new Error("legacy /sok must not call the managed Elasticsearch client");
      },
    };
    const app = createApp({
      elasticsearch: legacyElasticsearch,
      managedElasticsearch,
      logger,
      registry: new Registry(),
    });

    const response = await app.request("/adresser/v1/sok?kommunenummer=3007");
    expect(response.status).toBe(200);
    expect(legacyQueryBody?.query).toEqual({ match: { adresse_kommunenummer: "3007" } });
  });
});
