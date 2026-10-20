import { describe, expect, it } from "bun:test";
import { INDEX_PREFIX } from "../../src/config";
import { staleIndicesWithoutAlias } from "../../src/stale-indices";

describe("staleIndicesWithoutAlias", () => {
  it("velger bare indekser fra eget miljø som er minst 48 timer gamle og ikke har alias", () => {
    const old = `${INDEX_PREFIX}-20261017000000`;
    const boundary = `${INDEX_PREFIX}-20261017120000`;
    const recent = `${INDEX_PREFIX}-20261018000000`;
    const indices = {
      [old]: { aliases: {} },
      [boundary]: { aliases: {} },
      [recent]: { aliases: {} },
      [`${INDEX_PREFIX}-20261016000000-other`]: { aliases: {} },
      [`${INDEX_PREFIX}-prodtest-20261016000000`]: { aliases: {} },
      [`${INDEX_PREFIX}-20261301000000`]: { aliases: {} },
      [`${INDEX_PREFIX}-20261016000000`]: { aliases: { other_alias: {} } },
      [`${INDEX_PREFIX}-20261015000000`]: { aliases: { ed_adressesok: {} } },
    };

    expect(staleIndicesWithoutAlias(indices, new Date("2026-10-19T12:00:00.000Z"))).toEqual([
      old,
      boundary,
    ]);
  });
});
