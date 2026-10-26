import { afterAll, describe, expect, it } from "bun:test";

// Brukes ikke reelt i mock-modus, men createDatabricksSource() validerer at
// de er satt før den kobler til (se databricks.ts).
process.env.DATABRICKS_HOST ??= "mock.gcp.databricks.com";
process.env.DATABRICKS_HTTP_PATH ??= "/sql/1.0/warehouses/mock";
process.env.DATABRICKS_CLIENT_SECRET = JSON.stringify({
  client_id: "mock-client-id",
  client_secret: "mock-client-secret",
});
process.env.DATABRICKS_TABLE ??= "mock_matrikkel_adresse";
process.env.ES_URL ??= "http://localhost:9201";
process.env.ENVIRONMENT = "DEVELOPMENT";
// Eget alias/prefiks per kjøring: afterAll skal aldri slette lokal DEVELOPMENT-data.
process.env.INTEGRATION_TEST_ID = crypto.randomUUID().replaceAll("-", "");

const { ALIAS, INDEX_PREFIX } = await import("../../src/config");
const { es, indicesWithAlias, deleteIndices } = await import("../../src/elastic");
const { createDatabricksSource } = await import("../../src/databricks");
const { createFakeDatabricksClient } = await import("../../src/databricks.mock");
const { newIndexName } = await import("../../src/index-name");
const { runLoad } = await import("../../src/runner");
const { cleanUpStaleIndices } = await import("../../src/stale-indices");
const source = createDatabricksSource(createFakeDatabricksClient);

describe("runLoad mot lokal Elasticsearch", () => {
  afterAll(async () => {
    const indices = await es.indices.get({
      index: `${INDEX_PREFIX}-*`,
      allow_no_indices: true,
      ignore_unavailable: true,
    });
    await deleteIndices(Object.keys(indices));
    await source.close();
    await es.close();
  }, 30_000);

  it("laster fixtures inn i en ny indeks og peker aliaset dit", async () => {
    expect(await indicesWithAlias()).toEqual([]);
    await runLoad(source);

    const indices = await indicesWithAlias();
    expect(indices.length).toBe(1);

    const indexName = indices[0] as string;
    const { count } = await es.count({ index: indexName });
    expect(count).toBe(100);

    const alias = await es.indices.getAlias({ name: ALIAS });
    expect(Object.keys(alias)).toEqual([indexName]);

    const hits = await es.search({
      index: indexName,
      query: { term: { uuid: "2000001" } },
    });
    expect(hits.hits.hits.length).toBe(1);
    expect(hits.hits.hits[0]?._source).toMatchObject({
      adressenavn: null,
      kortnavn: null,
      adressetilleggsnavn: null,
      adressekode: null,
      nummer: null,
      bokstav: null,
      atkomstpunkt: { sommer: null, vinter: null, generell: null },
    });

    const last = await es.search({
      index: indexName,
      query: { term: { uuid: "2000100" } },
    });
    expect(last.hits.hits).toHaveLength(1);

    const { count: streetAddresses } = await es.count({
      index: indexName,
      query: { term: { adressetype: "Vegadresse" } },
    });
    expect(streetAddresses).toBe(66);

    const { count: unitNumbers } = await es.count({
      index: indexName,
      query: { exists: { field: "bruksenhetsnummer" } },
    });
    expect(unitNumbers).toBe(33);

    const { count: seasonalAccessPoints } = await es.count({
      index: indexName,
      query: { exists: { field: "atkomstpunkt.vinter" } },
    });
    expect(seasonalAccessPoints).toBe(33);

    const { count: generalAccessPoints } = await es.count({
      index: indexName,
      query: { exists: { field: "atkomstpunkt.generell" } },
    });
    expect(generalAccessPoints).toBe(66);
  }, 30_000);

  it("bytter aliaset til en ny indeks og lar den gamle stå i 7 dager", async () => {
    const indicesBeforeSecondRun = await indicesWithAlias();

    await runLoad(source);

    const indicesAfterSecondRun = await indicesWithAlias();
    expect(indicesAfterSecondRun.length).toBe(1);
    expect(indicesAfterSecondRun).not.toEqual(indicesBeforeSecondRun);

    for (const oldIndex of indicesBeforeSecondRun) {
      const exists = await es.indices.exists({ index: oldIndex });
      expect(exists).toBe(true);
    }
  }, 30_000);

  it("beholder aliaset når antall leste rader ikke stemmer med kilden", async () => {
    const previousIndices = await indicesWithAlias();
    const wrongCountSource = {
      ...source,
      countRows: async () => (await source.countRows()) + 1,
    };

    await expect(runLoad(wrongCountSource)).rejects.toThrow(/Leste .* rader/);
    expect(await indicesWithAlias()).toEqual(previousIndices);
  }, 30_000);

  it("sletter bare gamle indekser uten alias", async () => {
    const old = `${INDEX_PREFIX}-2020-01-01-000000000-utc`;
    const aliased = `${INDEX_PREFIX}-2020-01-02-000000000-utc`;
    const otherEnvironment = `${INDEX_PREFIX}-2020-01-03-000000000-utc-other`;
    const recent = newIndexName(new Date(Date.now() + 60_000));
    for (const index of [old, aliased, otherEnvironment, recent]) {
      await es.indices.create({ index });
    }
    await es.indices.putAlias({ index: aliased, name: "integration-protected" });
    const activeIndex = (await indicesWithAlias())[0];
    if (!activeIndex) throw new Error("Mangler aktiv indeks");

    await cleanUpStaleIndices(activeIndex);

    expect(await es.indices.exists({ index: old })).toBe(false);
    expect(await es.indices.exists({ index: aliased })).toBe(true);
    expect(await es.indices.exists({ index: otherEnvironment })).toBe(true);
    expect(await es.indices.exists({ index: recent })).toBe(true);
    expect(await indicesWithAlias()).toEqual([activeIndex]);
  }, 30_000);
});
