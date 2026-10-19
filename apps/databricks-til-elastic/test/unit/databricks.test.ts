import { describe, expect, it } from "bun:test";
import { ROWS_PER_BATCH_FROM_DATABRICKS } from "../../src/config";
import { createDatabricksSource, type MinimalDatabricksClient } from "../../src/databricks";
import { COLUMNS, type DatabricksRow } from "../../src/schema";

process.env.DATABRICKS_HOST = "test-workspace.gcp.databricks.com";
process.env.DATABRICKS_HTTP_PATH = "/sql/1.0/warehouses/testwarehouse";
process.env.DATABRICKS_CLIENT_ID = "test-client-id";
process.env.DATABRICKS_CLIENT_SECRET = "test-client-secret";
process.env.DATABRICKS_TABLE = "catalog.skjema.matrikkel_adresse";

const BASE: DatabricksRow = {
  uuid: "12345",
  adresse_id: 98765,
  adressetype: "Vegadresse",
  oppdateringsdato: "2024-05-01T12:34:56.789Z",
  adressetilleggsnavn: null,
  kortnavn: "Storgata",
  kommunenavn: "Oslo",
  postnummer: "0155",
  poststed: "OSLO",
  kommunenummer: "0301",
  gardsnummer: null,
  bruksnummer: null,
  festenummer: null,
  seksjonsnummer: 0,
  representasjonspunkt_stedfesting_verifisert: true,
  adressetekst: "Storgata 1",
  adressetekstutenadressetilleggsnavn: "Storgata 1",
  bruksenhetsnummer: ["H0101", "H0102"],
  adressekode: null,
  bokstav: null,
  adressenavn: "Storgata",
  nummer: 1,
  atkomstpunkt: null,
  representasjonspunkt: { lat: 59.91, lon: 10.75 },
};

/**
 * Minimal stand-in for @databricks/sql sin DBSQLClient, injisert i
 * `createDatabricksSource()` slik at vi kan teste hele kjeden i databricks.ts
 * (autentisering, SQL-bygging, rad-iterering og opprydding) uten et ekte
 * Databricks-warehouse.
 */
function createSpyClient(
  rowsToYield: DatabricksRow[],
  countRows: object[] = [{ total: rowsToYield.length }],
) {
  const connectCalls: unknown[] = [];
  const executeStatementCalls: string[] = [];
  const iterateRowsCalls: Array<{ maxRows?: number }> = [];
  let operationCloseCalls = 0;
  let sessionCloseCalls = 0;
  let clientCloseCalls = 0;

  const client: MinimalDatabricksClient = {
    async connect(options) {
      connectCalls.push(options);
      return {
        async openSession() {
          return {
            executeStatement: async (query: string) => {
              executeStatementCalls.push(query);
              const isCountQuery = query.startsWith("select count(*)");
              const rows: object[] = isCountQuery ? countRows : rowsToYield;
              return {
                iterateRows: (opts: { maxRows?: number }) => {
                  iterateRowsCalls.push(opts);
                  return (async function* () {
                    for (const row of rows) yield row;
                  })();
                },
                close: async () => {
                  operationCloseCalls++;
                },
              };
            },
            close: async () => {
              sessionCloseCalls++;
            },
          };
        },
      };
    },
    async close() {
      clientCloseCalls++;
    },
  };

  return {
    client,
    connectCalls,
    executeStatementCalls,
    iterateRowsCalls,
    operationCloseCalls: () => operationCloseCalls,
    sessionCloseCalls: () => sessionCloseCalls,
    clientCloseCalls: () => clientCloseCalls,
  };
}

async function drain<T>(generator: AsyncGenerator<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of generator) items.push(item);
  return items;
}

describe("createDatabricksSource mot @databricks/sql (injisert falsk klient)", () => {
  it("godtar antall som streng fra Databricks", async () => {
    const spy = createSpyClient([BASE], [{ total: "1" }]);
    const source = createDatabricksSource(() => spy.client);
    expect(await source.countRows()).toBe(1);
    await source.close();
  });

  it("feiler når tellingen ikke gir et gyldig antall, og lukker operasjonen", async () => {
    for (const result of [
      [],
      [{ total: null }],
      [{ total: "" }],
      [{ total: -1 }],
      [{ total: 1.5 }],
      [{ total: "9007199254740992" }],
    ]) {
      const spy = createSpyClient([BASE], result);
      const source = createDatabricksSource(() => spy.client);
      await expect(source.countRows()).rejects.toThrow(/antall rader/);
      expect(spy.operationCloseCalls()).toBe(1);
      await source.close();
    }
  });

  it(
    "kobler til med OAuth service principal, bygger spørringene og leser rader, " +
      "gjenbruker tilkoblingen og lukkes korrekt ved avslutning",
    async () => {
      const spy = createSpyClient([BASE, { ...BASE, uuid: null }]);
      const source = createDatabricksSource(() => spy.client);

      expect(await source.countRows()).toBe(2);
      const firstRun = await drain(source.rows());

      // Autentisering: OAuth client-credentials med service principal - ikke
      // personal access token.
      expect(spy.connectCalls).toEqual([
        {
          host: "test-workspace.gcp.databricks.com",
          path: "/sql/1.0/warehouses/testwarehouse",
          authType: "databricks-oauth",
          oauthScopes: ["all-apis"],
          oauthClientId: "test-client-id",
          oauthClientSecret: "test-client-secret",
        },
      ]);

      // Count the table, then select its configured columns.
      const expectedSelect = COLUMNS.map((c) => `\`${c}\``).join(", ");
      const expectedTable = "`catalog`.`skjema`.`matrikkel_adresse`";
      expect(spy.executeStatementCalls).toEqual([
        `select count(*) as total from ${expectedTable}`,
        `select ${expectedSelect} from ${expectedTable}`,
      ]);
      expect(spy.iterateRowsCalls).toEqual([
        { maxRows: 1 },
        { maxRows: ROWS_PER_BATCH_FROM_DATABRICKS },
      ]);

      expect(firstRun).toHaveLength(2);
      expect(firstRun[0]?.uuid).toBe("12345");
      expect(firstRun[1]?.uuid).toBeNull();

      // Begge operasjonene (count og select) lukkes etter kjøringen.
      expect(spy.operationCloseCalls()).toBe(2);

      // Andre kjøring skal gjenbruke samme tilkobling - ikke koble til på nytt.
      expect(await source.countRows()).toBe(2);
      const secondRun = await drain(source.rows());
      expect(secondRun).toHaveLength(2);
      expect(spy.connectCalls).toHaveLength(1);
      expect(spy.executeStatementCalls).toHaveLength(4);
      expect(spy.operationCloseCalls()).toBe(4);

      // Avslutning: close() skal lukke både session og klient.
      await source.close();
      expect(spy.sessionCloseCalls()).toBe(1);
      expect(spy.clientCloseCalls()).toBe(1);
    },
  );

  it("avviser ugyldig tabellnavn før noen spørring sendes til Databricks", async () => {
    const spy = createSpyClient([BASE]);
    const source = createDatabricksSource(() => spy.client);
    process.env.DATABRICKS_TABLE = "matrikkel_adresse; drop table x --";

    await expect(source.countRows()).rejects.toThrow(/Ugyldig DATABRICKS_TABLE/);

    expect(spy.executeStatementCalls).toHaveLength(0);
    expect(spy.connectCalls).toHaveLength(0);

    process.env.DATABRICKS_TABLE = "catalog.skjema.matrikkel_adresse";
  });

  it("godtar katalognavn med bindestrek (Unity Catalog), hvert ledd backtick-kvotert", async () => {
    const spy = createSpyClient([BASE]);
    const source = createDatabricksSource(() => spy.client);
    process.env.DATABRICKS_TABLE =
      "eiendom_matrikkelen-adresse.3_gold_schema.matrikkel_adressesok_produkt_gold";

    await source.countRows();
    await drain(source.rows());

    const expectedSelect = COLUMNS.map((c) => `\`${c}\``).join(", ");
    const expectedTable =
      "`eiendom_matrikkelen-adresse`.`3_gold_schema`.`matrikkel_adressesok_produkt_gold`";
    expect(spy.executeStatementCalls).toEqual([
      `select count(*) as total from ${expectedTable}`,
      `select ${expectedSelect} from ${expectedTable}`,
    ]);

    process.env.DATABRICKS_TABLE = "catalog.skjema.matrikkel_adresse";
  });
});
