import { describe, expect, test } from "bun:test";
import { geoPointSearchBody } from "../../src/routes/point-search";

describe("point search query construction", () => {
  test("builds the geo query and sort", () => {
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
