import { describe, expect, test } from "bun:test";
import { buildRowsQuery } from "../../src/databricks";

describe("buildRowsQuery", () => {
  test("sorts address rows by uuid", () => {
    expect(buildRowsQuery("`catalog`.`schema`.`addresses`")).toContain(
      "order by adressetekst asc, uuid asc",
    );
  });
});
