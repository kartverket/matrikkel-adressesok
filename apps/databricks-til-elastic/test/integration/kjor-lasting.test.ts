import { afterAll, describe, expect, it } from "bun:test";

process.env.DATABRICKS_MOCK = "true";
// Brukes ikke reelt i mock-modus, men createDatabricksSource() validerer at
// de er satt før den kobler til (se databricks.ts).
process.env.DATABRICKS_HOST ??= "mock.gcp.databricks.com";
process.env.DATABRICKS_HTTP_PATH ??= "/sql/1.0/warehouses/mock";
process.env.DATABRICKS_CLIENT_ID ??= "mock-client-id";
process.env.DATABRICKS_CLIENT_SECRET ??= "mock-client-secret";
process.env.DATABRICKS_TABLE ??= "mock_matrikkel_adresse";
process.env.ES_URL ??= "http://localhost:9201";
process.env.INDEX_SUFFIX = `-test-${Date.now()}`;

const { ALIAS, INDEX_PREFIX } = await import("../../src/config");
const { es, indicesWithAlias, deleteIndices } = await import("../../src/elastic");
const { runLoad, closeClients } = await import("../../src/runner");

describe("runLoad mot lokal Elasticsearch", () => {
  afterAll(async () => {
    const indices = await es.indices.get({
      index: `${INDEX_PREFIX}-*`,
      allow_no_indices: true,
      ignore_unavailable: true,
    });
    await deleteIndices(Object.keys(indices));
    await closeClients();
  }, 30_000);

  it("laster fixtures inn i en ny indeks og peker aliaset dit", async () => {
    expect(await indicesWithAlias()).toEqual([]);
    await runLoad();

    const indices = await indicesWithAlias();
    expect(indices.length).toBe(1);

    const indexName = indices[0] as string;
    const { count } = await es.count({ index: indexName });
    expect(count).toBeGreaterThan(0);

    const alias = await es.indices.getAlias({ name: ALIAS });
    expect(Object.keys(alias)).toEqual([indexName]);

    const hits = await es.search({
      index: indexName,
      query: { term: { uuid: "2000001" } },
    });
    expect(hits.hits.hits.length).toBe(1);
  }, 30_000);

  it("bytter aliaset til en ny indeks og lar den gamle stå i 48 timer", async () => {
    const indicesBeforeSecondRun = await indicesWithAlias();

    await runLoad();

    const indicesAfterSecondRun = await indicesWithAlias();
    expect(indicesAfterSecondRun.length).toBe(1);
    expect(indicesAfterSecondRun).not.toEqual(indicesBeforeSecondRun);

    for (const oldIndex of indicesBeforeSecondRun) {
      const exists = await es.indices.exists({ index: oldIndex });
      expect(exists).toBe(true);
    }
  }, 30_000);
});
