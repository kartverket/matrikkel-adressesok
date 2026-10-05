import { afterAll, describe, expect, it } from "bun:test";

process.env.DATABRICKS_MOCK = "true";
process.env.ES_URL ??= "http://localhost:9201";
process.env.INDEX_SUFFIX = `-test-${Date.now()}`;

const { ALIAS } = await import("../../src/config");
const { es, indekserMedAlias, slettIndekser } = await import("../../src/elastic");
const { kjørLasting, lukkKlienter } = await import("../../src/runner");

describe("kjørLasting mot lokal Elasticsearch", () => {
  afterAll(async () => {
    const indekser = await indekserMedAlias();
    await slettIndekser(indekser);
    await lukkKlienter();
  });

  it("laster fixtures inn i en ny indeks og peker aliaset dit", async () => {
    await kjørLasting();

    const indekser = await indekserMedAlias();
    expect(indekser.length).toBe(1);

    const indeksnavn = indekser[0] as string;
    const { count } = await es.count({ index: indeksnavn });
    expect(count).toBeGreaterThan(0);

    const alias = await es.indices.getAlias({ name: ALIAS });
    expect(Object.keys(alias)).toEqual([indeksnavn]);

    const treff = await es.search({
      index: indeksnavn,
      query: { term: { lokalid: "2000001" } },
    });
    expect(treff.hits.hits.length).toBe(1);
  });

  it("bytter aliaset til en ny indeks og sletter den gamle ved andre kjøring", async () => {
    const indekserFørAndreKjøring = await indekserMedAlias();

    await kjørLasting();

    const indekserEtterAndreKjøring = await indekserMedAlias();
    expect(indekserEtterAndreKjøring.length).toBe(1);
    expect(indekserEtterAndreKjøring).not.toEqual(indekserFørAndreKjøring);

    for (const gammelIndeks of indekserFørAndreKjøring) {
      const finnes = await es.indices.exists({ index: gammelIndeks });
      expect(finnes).toBe(false);
    }
  });
});
