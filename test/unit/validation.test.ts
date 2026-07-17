import { describe, expect, test } from "bun:test";
import { GeoPointSchema } from "../../src/routes/point-search";
import { GeneralSearchSchema } from "../../src/routes/search";
import { formatValidationErrors } from "../../src/utils/query-validation";

function validate(schema: typeof GeneralSearchSchema | typeof GeoPointSchema, query = ""): unknown {
  const result = schema.safeParse(Object.fromEntries(new URLSearchParams(query)));
  return result.success ? result.data : { message: formatValidationErrors(result.error) };
}

describe("query validation", () => {
  test("applies the legacy defaults", () => {
    expect(validate(GeneralSearchSchema, "sok=munkegata")).toMatchObject({
      sok: "munkegata",
      fuzzy: false,
      treffPerSide: 10,
      side: 0,
      asciiKompatibel: true,
      utkoordsys: 4258,
    });
  });

  test("uses the exact objtype validation error", () => {
    expect(validate(GeneralSearchSchema, "objtype=*adresse")).toEqual({
      message: {
        objtype: ["Feil i søkeparameter. Gyldige verdier er: ('Matrikkeladresse', 'Vegadresse')"],
      },
    });
  });

  test("rejects unknown fields like Marshmallow", () => {
    expect(validate(GeneralSearchSchema, "unknown=true")).toEqual({
      message: { unknown: ["Unknown field."] },
    });
  });

  test("requires all point-search inputs", () => {
    expect(validate(GeoPointSchema)).toEqual({
      message: {
        lat: ["Missing data for required field."],
        lon: ["Missing data for required field."],
        radius: ["Missing data for required field."],
      },
    });
  });

  test("accepts Marshmallow boolean spellings", () => {
    expect(validate(GeneralSearchSchema, "sok=x&fuzzy=True")).toMatchObject({
      fuzzy: true,
    });
    expect(validate(GeneralSearchSchema, "sok=x&fuzzy=0")).toMatchObject({
      fuzzy: false,
    });
  });

  test("normalizes the search mode", () => {
    expect(validate(GeneralSearchSchema, "sok=x&sokemodus=or")).toMatchObject({
      sokemodus: "OR",
    });
  });

  test("enforces the 10,000-result pagination limit", () => {
    expect(validate(GeneralSearchSchema, "sok=x&treffPerSide=1000&side=10")).toEqual({
      message: {
        side: [
          "Api-et returner ikke mer enn de første 10 000 treffene. Men datasettet kan lastes ned i sin helhet fra Geonorge.no .",
        ],
      },
    });
  });
});
