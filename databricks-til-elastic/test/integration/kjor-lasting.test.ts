import { afterAll, describe, expect, it } from "bun:test";

process.env.DATABRICKS_MOCK = "true";
process.env.ES_URL ??= "http://localhost:9201";
process.env.INDEX_SUFFIX = `-test-${Date.now()}`;

const { ALIAS } = await import("../../src/config");
const { es, indicesWithAlias, deleteIndices } = await import("../../src/elastic");
const { runLoad, closeClients } = await import("../../src/runner");

describe("runLoad mot lokal Elasticsearch", () => {
  afterAll(async () => {
    const indices = await indicesWithAlias();
    await deleteIndices(indices);
    await closeClients();
  }, 30_000);

  it("laster fixtures inn i en ny indeks og peker aliaset dit", async () => {
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
      query: { term: { lokalid: "2000001" } },
    });
    expect(hits.hits.hits.length).toBe(1);
  }, 30_000);

  it("bytter aliaset til en ny indeks og sletter den gamle ved andre kjøring", async () => {
    const indicesBeforeSecondRun = await indicesWithAlias();

    await runLoad();

    const indicesAfterSecondRun = await indicesWithAlias();
    expect(indicesAfterSecondRun.length).toBe(1);
    expect(indicesAfterSecondRun).not.toEqual(indicesBeforeSecondRun);

    for (const oldIndex of indicesBeforeSecondRun) {
      const exists = await es.indices.exists({ index: oldIndex });
      expect(exists).toBe(false);
    }
  }, 30_000);
});
