import { describe, expect, test } from "bun:test";
import { HttpError } from "../../src/http";
import { GeneralSearchSchema } from "../../src/routes/search-parameters";
import { constructQuery } from "../../src/routes/search-query";

function parameters(query: string) {
  return GeneralSearchSchema.parse(Object.fromEntries(new URLSearchParams(query)));
}

describe("search query construction", () => {
  test("builds cross-field and exact field clauses", () => {
    const parsed = parameters(
      "sok=munkegata+1+trondheim&kommunenummer=5001&adressetekst=Munkegata+1",
    );
    expect(constructQuery(parsed)).toEqual({
      bool: {
        must: [
          expect.objectContaining({
            simple_query_string: expect.objectContaining({
              query: "munkegata 1 trondheim",
              default_operator: "AND",
            }),
          }),
          { match_phrase: { adressetekst: "Munkegata 1" } },
          { match: { kommunenummer: "5001" } },
        ],
      },
    });
  });

  test("uses match_phrase_prefix for supported wildcard fields", () => {
    const parsed = parameters("poststed=høne*");
    expect(constructQuery(parsed)).toEqual({
      match_phrase_prefix: { poststed: { query: "høne", max_expansions: 500 } },
    });
  });

  test("strips a colon so it can't be read as a ES field selector", () => {
    const parsed = parameters("sok=Haugesund%3A+Rennes%C3%B8ygate+16+5537");
    expect(constructQuery(parsed)).toMatchObject({
      simple_query_string: { query: "Haugesund Rennesøygate 16 5537", default_operator: "AND" },
    });
  });

  test("strips bang so it can't be read as a dangling NOT operator", () => {
    const parsed = parameters("sok=frogner+95554385!!+2016");
    expect(constructQuery(parsed)).toMatchObject({
      simple_query_string: { query: "frogner 95554385 2016", default_operator: "AND" },
    });
  });

  test("rejects wildcard combined with fuzzy search", () => {
    const parsed = parameters("sok=osloveie*&fuzzy=1");
    expect(() => constructQuery(parsed)).toThrow(HttpError);
  });
});
