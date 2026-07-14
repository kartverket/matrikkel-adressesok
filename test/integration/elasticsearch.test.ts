import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import pino from "pino";
import { createApp } from "../../src/app";
import type { AppConfig } from "../../src/config";
import { ElasticsearchClient } from "../../src/elasticsearch";

const elasticsearchUrl = Bun.env.ELS_ADRESSER_URL ?? "http://localhost:9200";
const index = Bun.env.ELS_ADRESSER_INDEX ?? "adressesok-test";

const config: AppConfig = {
  elasticSearch: {
    url: elasticsearchUrl,
    username: undefined,
    password: undefined,
    index: "adressesok-test",
    requestTimeout: 20_000,
  },
  port: 3000,
  logLevel: "error",
};

const logger = pino({ enabled: false });

async function elasticsearch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${elasticsearchUrl}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
}

describe("Elasticsearch 7 integration", () => {
  beforeAll(async () => {
    await elasticsearch(`/${index}`, { method: "DELETE" });
    const create = await elasticsearch(`/${index}`, {
      method: "PUT",
      body: JSON.stringify({
        mappings: {
          properties: {
            adressenavn: { type: "text" },
            adressetekst: { type: "text" },
            adresse_kommunenummer: { type: "text" },
            nummer: { type: "integer" },
            poststed: { type: "text" },
            representasjonspunkt: { type: "geo_point" },
            oppdateringsdato: { type: "date" },
          },
        },
      }),
    });
    if (!create.ok) throw new Error(await create.text());

    const bulk = `${[
      { index: { _index: index, _id: "1" } },
      {
        adressenavn: "Kartverksveien",
        adressetekst: "Kartverksveien 2",
        adresse_kommunenummer: "3007",
        nummer: 2,
        poststed: "HØNEFOSS",
        representasjonspunkt: { lat: 60.145187, lon: 10.2497 },
        oppdateringsdato: "2022-01-27T19:50:50.000Z",
      },
      { index: { _index: index, _id: "2" } },
      {
        adressenavn: "Slottsplassen",
        adressetekst: "Slottsplassen 1",
        adresse_kommunenummer: "0301",
        nummer: 1,
        poststed: "OSLO",
        representasjonspunkt: { lat: 59.917, lon: 10.7277 },
        oppdateringsdato: "2024-01-01T12:00:00Z",
      },
    ]
      .map((line) => JSON.stringify(line))
      .join("\n")}\n`;
    const indexed = await elasticsearch("/_bulk?refresh=true", {
      method: "POST",
      body: bulk,
      headers: { "content-type": "application/x-ndjson" },
    });
    if (!indexed.ok) throw new Error(await indexed.text());
    const bulkResult = (await indexed.json()) as {
      errors: boolean;
      items: unknown[];
    };
    if (bulkResult.errors)
      throw new Error(`Bulk indexing failed: ${JSON.stringify(bulkResult.items)}`);
  });

  afterAll(async () => {
    await elasticsearch(`/${index}`, { method: "DELETE" });
  });

  test("executes the legacy exact address query", async () => {
    const gateway = new ElasticsearchClient(config, logger);
    const app = createApp({ elasticsearch: gateway, logger });
    const response = await app.request("/adresser/v1/sok?adressetekst=Kartverksveien%202");
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      metadata: { totaltAntallTreff: number };
      adresser: unknown[];
    };
    expect(body.metadata.totaltAntallTreff).toBe(1);
    expect(body.adresser).toContainEqual(
      expect.objectContaining({ adressetekst: "Kartverksveien 2" }),
    );
  });

  test("executes geo-distance filtering and sorting", async () => {
    const gateway = new ElasticsearchClient(config, logger);
    const app = createApp({ elasticsearch: gateway, logger });
    const response = await app.request(
      "/adresser/v1/punktsok?lat=59.917&lon=10.7277&radius=10&treffPerSide=1",
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      adresser: Array<Record<string, unknown>>;
    };
    expect(body.adresser[0]).toMatchObject({
      adressenavn: "Slottsplassen",
      nummer: 1,
    });
    expect(body.adresser[0]?.meterDistanseTilPunkt).toBeNumber();
  });
});
