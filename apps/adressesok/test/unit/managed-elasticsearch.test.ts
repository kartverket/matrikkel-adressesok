import { describe, expect, test } from "bun:test";
import pino from "pino";
import { loadConfig } from "../../src/config";
import { ManagedElasticsearchClient } from "../../src/managed-elasticsearch";

const logger = pino({ enabled: false });

describe("managed Elasticsearch search", () => {
  test("queries the configured alias and returns documents with their total", async () => {
    const document = { uuid: "adresse-1", adressetekst: "Testveien 1" };
    let path: string | undefined;
    let body: unknown;
    const server = Bun.serve({
      port: 0,
      async fetch(request) {
        path = new URL(request.url).pathname;
        body = await request.json();
        return Response.json(
          { hits: { total: { value: 1, relation: "eq" }, hits: [{ _source: document }] } },
          { headers: { "x-elastic-product": "Elasticsearch" } },
        );
      },
    });

    try {
      const config = loadConfig({
        ELS_ADRESSER_URL: "http://localhost:9200",
        ES_URL: `http://localhost:${server.port}`,
      });
      const client = new ManagedElasticsearchClient(config.managedElasticSearch, logger);
      const result = await client.search({ query: { match_all: {} }, size: 1 });
      expect(result.total).toBe(1);
      expect(result.hits[0]?._source.uuid).toBe(document.uuid);
      expect(result.hits[0]?._source.adressetekst).toBe(document.adressetekst);
      expect(path).toBe("/ed_adressesok-development/_search");
      expect(body).toMatchObject({ query: { match_all: {} }, size: 1 });
    } finally {
      server.stop(true);
    }
  });

  test("returns an empty result when the alias has no documents", async () => {
    const server = Bun.serve({
      port: 0,
      fetch: () =>
        Response.json(
          { hits: { total: { value: 0, relation: "eq" }, hits: [] } },
          { headers: { "x-elastic-product": "Elasticsearch" } },
        ),
    });

    try {
      const config = loadConfig({
        ELS_ADRESSER_URL: "http://localhost:9200",
        ES_URL: `http://localhost:${server.port}`,
      });
      const client = new ManagedElasticsearchClient(config.managedElasticSearch, logger);
      expect(await client.search({ query: { match_all: {} }, size: 1 })).toEqual({
        total: 0,
        hits: [],
      });
    } finally {
      server.stop(true);
    }
  });
});
