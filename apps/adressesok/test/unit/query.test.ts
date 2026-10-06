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
            simple_query_string: {
              query: "munkegata 1 trondheim",
              default_operator: "AND",
              fuzzy_max_expansions: 100,
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

  test("strips a colon so it can't be read as a ES field selector", () => {
    const parsed = parameters("sok=Haugesund%3A+Rennes%C3%B8ygate+16+5537");
    expect(constructGeneralQuery(parsed)).toEqual({
      simple_query_string: {
        query: "Haugesund Rennesøygate 16 5537",
        default_operator: "AND",
        fuzzy_max_expansions: 100,
      },
    });
  });

  test("strips bang so it can't be read as a dangling NOT operator", () => {
    const parsed = parameters("sok=frogner+95554385!!+2016");
    expect(constructGeneralQuery(parsed)).toEqual({
      simple_query_string: {
        query: "frogner 95554385 2016",
        default_operator: "AND",
        fuzzy_max_expansions: 100,
      },
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
          must: [{ simple_query_string: { query: "*" } }],
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
