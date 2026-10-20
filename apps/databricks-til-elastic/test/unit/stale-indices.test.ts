import { describe, expect, it } from "bun:test";
import { INDEX_PREFIX } from "../../src/config";
import { newIndexName } from "../../src/index-name";
import { staleIndicesWithoutAlias } from "../../src/stale-indices";

describe("staleIndicesWithoutAlias", () => {
  it("velger bare indekser fra eget miljø som er minst 48 timer gamle og ikke har alias", () => {
    const old = `${INDEX_PREFIX}-2026-10-17-000000000-utc`;
    const boundary = `${INDEX_PREFIX}-2026-10-17-120000000-utc`;
    const recent = `${INDEX_PREFIX}-2026-10-18-000000000-utc`;
    const indices = {
      [old]: { aliases: {} },
      [boundary]: { aliases: {} },
      [recent]: { aliases: {} },
      [`${INDEX_PREFIX}-2026-10-16-000000000-utc-other`]: { aliases: {} },
      [`${INDEX_PREFIX}-prodtest-2026-10-16-000000000-utc`]: { aliases: {} },
      [`${INDEX_PREFIX}-2026-13-01-000000000-utc`]: { aliases: {} },
      [`${INDEX_PREFIX}-2026-10-16-000000000-utc`]: { aliases: { other_alias: {} } },
      [`${INDEX_PREFIX}-2026-10-15-000000000-utc`]: { aliases: { ed_adressesok: {} } },
    };

    expect(staleIndicesWithoutAlias(indices, new Date("2026-10-19T12:00:00.000Z"))).toEqual([
      old,
      boundary,
    ]);
  });

  it("bruker lesbart UTC-tidspunkt som kan gjenkjennes ved opprydding", () => {
    const name = newIndexName(new Date("2026-10-17T12:00:00.123Z"));
    expect(name).toBe(`${INDEX_PREFIX}-2026-10-17-120000123-utc`);
    expect(
      staleIndicesWithoutAlias({ [name]: { aliases: {} } }, new Date("2026-10-19T12:00:00.122Z")),
    ).toEqual([]);
    expect(
      staleIndicesWithoutAlias({ [name]: { aliases: {} } }, new Date("2026-10-19T12:00:00.123Z")),
    ).toEqual([name]);
  });
});
