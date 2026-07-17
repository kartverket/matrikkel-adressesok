import { describe, expect, test } from "bun:test";
import { HttpError } from "../../src/http";
import { geoPointSearchBody } from "../../src/routes/point-search";
import { constructGeneralQuery, GeneralSearchSchema } from "../../src/routes/search";

function parameters(query: string) {
  return GeneralSearchSchema.parse(Object.fromEntries(new URLSearchParams(query)));
}

describe("Elasticsearch 7 query compatibility", () => {
  test("builds cross-field and exact field clauses", () => {
    const parsed = parameters(
      "sok=munkegata+1+trondheim&kommunenummer=5001&adressetekst=Munkegata+1",
    );
    expect(constructGeneralQuery(parsed)).toEqual({
      bool: {
        must: [
          {
            query_string: {
              query: "munkegata AND 1 AND trondheim",
              default_operator: "AND",
              fuzzy_max_expansions: 100,
              type: "cross_fields",
            },
          },
          { match_phrase: { adressetekst: "Munkegata 1" } },
          { match: { adresse_kommunenummer: "5001" } },
        ],
      },
    });
  });

  test("uses match_phrase_prefix for supported wildcard fields", () => {
    const parsed = parameters("poststed=høne*");
    expect(constructGeneralQuery(parsed)).toEqual({
      match_phrase_prefix: { poststed: { query: "høne", max_expansions: 500 } },
    });
  });

  test("rejects wildcard combined with fuzzy search", () => {
    const parsed = parameters("sok=osloveie*&fuzzy=1");
    expect(() => constructGeneralQuery(parsed)).toThrow(HttpError);
  });

  test("builds the ES7 geo query and sort", () => {
    expect(geoPointSearchBody(60, 11, 1000, 0, 10)).toMatchObject({
      query: {
        bool: {
          must: [{ query_string: { query: "*" } }],
          filter: [
            {
              geo_distance: {
                distance: "1000m",
                representasjonspunkt: { lat: 60, lon: 11 },
              },
            },
          ],
        },
      },
      sort: [{ _geo_distance: { unit: "m", distance_type: "arc" } }],
    });
  });
});
