import { describe, expect, test } from "bun:test";
import pino from "pino";
import { createApp } from "../../src/app";
import type { Elasticsearch } from "../../src/elasticsearch";

const logger = pino({ enabled: false });

function appWith(elasticsearch: Elasticsearch) {
  return createApp({ elasticsearch, logger });
}

describe("HTTP application", () => {
  test("serves the search response in the legacy shape", async () => {
    const app = appWith({
      isReady: async () => true,
      search: async () => ({
        total: 1,
        hits: [
          {
            _source: {
              adressetekst: "Kartverksveien 2",
              adresse_kommunenummer: "3007",
              poststed: "HØNEFOSS",
              oppdateringsdato: "2022-01-27T19:50:50.000Z",
              representasjonspunkt: {
                epsg: "EPSG:4258",
                lat: 60.145187,
                lon: 10.2497,
              },
              objid: 123,
            },
          },
        ],
      }),
    });
    const response = await app.request("/adresser/v1/sok?sok=Kartverksveien%202&treffPerSide=1");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      metadata: {
        treffPerSide: 1,
        side: 0,
        totaltAntallTreff: 1,
        viserFra: 0,
        viserTil: 1,
        sokeStreng: "sok=Kartverksveien%202&treffPerSide=1",
        asciiKompatibel: true,
      },
      adresser: [
        {
          adressenavn: null,
          adressetekst: "Kartverksveien 2",
          adressetilleggsnavn: null,
          adressekode: null,
          nummer: null,
          bokstav: null,
          kommunenummer: "3007",
          kommunenavn: null,
          gardsnummer: null,
          bruksnummer: null,
          festenummer: null,
          undernummer: null,
          objtype: null,
          poststed: "HØNEFOSS",
          postnummer: null,
          adressetekstutenadressetilleggsnavn: null,
          representasjonspunkt: {
            epsg: "EPSG:4258",
            lat: 60.145187,
            lon: 10.2497,
          },
          oppdateringsdato: "2022-01-27T19:50:50",
        },
      ],
    });
  });

  test("applies dotted response filtering", async () => {
    const app = appWith({
      isReady: async () => true,
      search: async () => ({
        total: 1,
        hits: [{ _source: { nummer: 2, bokstav: "A" } }],
      }),
    });
    const response = await app.request(
      "/adresser/v1/sok?sok=x&filtrer=adresser.nummer,metadata.side",
    );
    expect(await response.json()).toEqual({
      metadata: { side: 0 },
      adresser: [{ nummer: 2 }],
    });
  });

  test("filters nested representation point fields", async () => {
    const app = appWith({
      isReady: async () => true,
      search: async () => ({
        total: 1,
        hits: [
          {
            _source: {
              representasjonspunkt: { lat: 60.1, lon: 10.2 },
            },
          },
        ],
      }),
    });
    const response = await app.request(
      "/adresser/v1/sok?sok=x&filtrer=adresser.representasjonspunkt.lat",
    );

    expect(await response.json()).toEqual({
      adresser: [{ representasjonspunkt: { lat: 60.1 } }],
    });
  });

  test("honors the ASCII-compatible response option", async () => {
    const app = appWith({
      isReady: async () => true,
      search: async () => ({
        total: 1,
        hits: [{ _source: { poststed: "HØNEFOSS" } }],
      }),
    });

    const ascii = await app.request("/adresser/v1/sok?sok=x");
    const unicode = await app.request("/adresser/v1/sok?sok=x&asciiKompatibel=false");
    expect(await ascii.text()).toContain("H\\u00d8NEFOSS");
    expect(await unicode.text()).toContain("HØNEFOSS");
  });

  test("uses the Hono Zod validation middleware", async () => {
    const app = appWith({
      isReady: async () => true,
      search: async () => ({ total: 0, hits: [] }),
    });
    const response = await app.request("/adresser/v1/sok?objtype=invalid");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      message: {
        objtype: ["Feil i søkeparameter. Gyldige verdier er: ('Matrikkeladresse', 'Vegadresse')"],
      },
    });
  });

  test.only("acceps duplicated scaler query parameters, and uses first occurence", async () => {
    let searchCalls = 0;
    let capturedQuery: unknown;

    const app = appWith({
      isReady: async () => true,
      search: async (body) => {
        searchCalls++;
        capturedQuery = body.query;
        return { total: 0, hits: [] };
      },
    });

    const query = "sok=Lakkegata&fuzzy=true&fuzzy=false";
    const response = await app.request(`/adresser/v1/sok?${query}`);

    expect(response.status).toBe(200);
    expect(capturedQuery).toEqual({
      query_string: {
        query: "Lakkegata~",
        default_operator: "AND",
        fuzzy_max_expansions: 100,
        type: "cross_fields",
      },
    });
    expect(searchCalls).toBe(1);
    expect(await response.json()).toMatchObject({
      metadata: {
        totaltAntallTreff: 0,
        sokeStreng: query,
      },
      adresser: [],
    });
  });

  test("allows selecting a whole top-level response field", async () => {
    const app = appWith({
      isReady: async () => true,
      search: async () => ({ total: 1, hits: [{ _source: { nummer: 2 } }] }),
    });
    const response = await app.request("/adresser/v1/sok?sok=x&filtrer=metadata");
    expect(await response.json()).toEqual({
      metadata: {
        treffPerSide: 10,
        side: 0,
        totaltAntallTreff: 1,
        viserFra: 0,
        viserTil: 10,
        sokeStreng: "sok=x&filtrer=metadata",
        asciiKompatibel: true,
      },
    });
  });

  test("rejects unsupported response filters", async () => {
    const app = appWith({
      isReady: async () => true,
      search: async () => ({ total: 0, hits: [] }),
    });
    const response = await app.request("/adresser/v1/sok?sok=x&filtrer=bokstav");

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      message: "Feil i filtreringsparameter",
    });
  });

  test("reports readiness based on Elasticsearch", async () => {
    const app = appWith({
      isReady: async () => false,
      search: async () => ({ total: 0, hits: [] }),
    });
    const response = await app.request("/adresser/v1/internal/isReady");
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "DOWN" });
  });

  test("exposes Prometheus metrics", async () => {
    const app = appWith({
      isReady: async () => true,
      search: async () => ({ total: 0, hits: [] }),
    });
    const response = await app.request("/adresser/v1/internal/metrics");
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("http_requests_total");
  });

  test("does not expose API routes outside the base path", async () => {
    const app = appWith({
      isReady: async () => true,
      search: async () => ({ total: 0, hits: [] }),
    });

    expect((await app.request("/sok?sok=x")).status).toBe(404);
    expect((await app.request("/internal/isAlive")).status).toBe(404);
  });
});
