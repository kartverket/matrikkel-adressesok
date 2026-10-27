import { describe, expect, test } from "bun:test";
import pino from "pino";
import { Registry } from "prom-client";
import { createApp } from "../../src/app";
import type { ManagedSearchResult } from "../../src/managed-elasticsearch";

const logger = pino({ enabled: false });

describe("internal managed search routes", () => {
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

  test("/internal/sok returns atkomstpunkt, reprojected with utkoordsys", async () => {
    const managedElasticsearch = {
      isReady: async () => true,
      search: async () =>
        ({
          total: 1,
          hits: [
            {
              _source: {
                adresse_id: "12345",
                adressetype: "Vegadresse",
                oppdateringsdato: "2022-01-27T19:50:50.000Z",
                bruksenhetsnummer: [],
                representasjonspunkt: { lat: 60.145187, lon: 10.2497 },
                atkomstpunkt: {
                  sommer: { lat: 60.1, lon: 10.2 },
                  vinter: null,
                  generell: null,
                },
              },
            },
          ],
        }) as unknown as ManagedSearchResult,
    };
    const app = createApp({
      elasticsearch,
      managedElasticsearch,
      logger,
      registry: new Registry(),
    });

    const body = (await (
      await app.request("/adresser/v1/internal/sok?kommunenummer=3007")
    ).json()) as {
      adresser: Array<{ adresseid: string; atkomstpunkt: Record<string, unknown> }>;
    };
    expect(body.adresser[0]?.adresseid).toBe("12345");
    expect(body.adresser[0]?.atkomstpunkt).toEqual({
      sommer: { epsg: "EPSG:4258", lat: 60.1, lon: 10.2 },
      vinter: null,
      generell: null,
    });

    const utm = (await (
      await app.request("/adresser/v1/internal/sok?kommunenummer=3007&utkoordsys=25833")
    ).json()) as {
      adresser: Array<{ atkomstpunkt: { sommer: { epsg: string }; vinter: null } }>;
    };
    expect(utm.adresser[0]?.atkomstpunkt.sommer.epsg).toBe("EPSG:25833");
    expect(utm.adresser[0]?.atkomstpunkt.vinter).toBeNull();
  });

  test("/internal/sok searches on undernummer", async () => {
  test("/sok strips wildcards on keyword fields and matches exactly", async () => {
    let capturedQuery: unknown;
    const managedElasticsearch = {
      isReady: async () => true,
      search: async (body: { query?: unknown }) => {
        capturedQuery = body.query;
        return { total: 0, hits: [] };
      },
    };
    const app = createApp({ managedElasticsearch, logger, registry: new Registry() });

    const response = await app.request("/adresser/v1/sok?postnummer=0154*");
    expect(response.status).toBe(200);
    expect(capturedQuery).toEqual({ match: { postnummer: "0154" } });
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
});
