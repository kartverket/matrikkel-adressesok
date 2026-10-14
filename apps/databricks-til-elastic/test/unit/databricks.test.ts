import { describe, expect, it } from "bun:test";
import { ROWS_PER_BATCH_FROM_DATABRICKS } from "../../src/config";
import { createDatabricksSource, type MinimalDatabricksClient } from "../../src/databricks";
import { COLUMNS, type DatabricksRow } from "../../src/schema";

process.env.DATABRICKS_HOST = "test-workspace.gcp.databricks.com";
process.env.DATABRICKS_HTTP_PATH = "/sql/1.0/warehouses/testwarehouse";
process.env.DATABRICKS_CLIENT_ID = "test-client-id";
process.env.DATABRICKS_CLIENT_SECRET = "test-client-secret";
process.env.DATABRICKS_TABLE = "catalog.skjema.matrikkel_adresse";

const TS = "2026-09-02T10:00:00.000Z";

const BASE: DatabricksRow = {
  lokalid: 12345,
  adresseid: 98765,
  objid: "obj-98765",
  objtype: "vegadresse",
  oppdateringsdato: "2024-05-01 12:34:56.789",
  adressetilleggsnavn: null,
  kortnavn: "Storgata",
  kommunenavn: "Oslo",
  postnummer: "0155",
  poststed: "OSLO",
  adresse_kommunenummer: "0301",
  gardsnummer: null,
  bruksnummer: null,
  festenummer: null,
  seksjonsnummer: 0,
  stedfestingverifisert: true,
  adressetekst: "Storgata 1",
  adressetekstutenadressetilleggsnavn: "Storgata 1",
  bruksenhetsnummer: `["H0101","H0102"]`,
  adressekode: null,
  bokstav: null,
  adressenavn: "Storgata",
  nummer: 1,
  atkomstpunkt: null,
  representasjonspunkt: JSON.stringify({ lat: 59.91, lon: 10.75 }),
};

/**
 * Minimal stand-in for @databricks/sql sin DBSQLClient, injisert i
 * `createDatabricksSource()` slik at vi kan teste hele kjeden i databricks.ts
 * (autentisering, SQL-bygging, rad-iterering og opprydding) uten et ekte
 * Databricks-warehouse.
 */
function createSpyClient(rowsToYield: DatabricksRow[]) {
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
              return {
                iterateRows: (opts: { maxRows?: number }) => {
                  iterateRowsCalls.push(opts);
                  return (async function* () {
                    for (const row of rowsToYield) yield row;
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
  it(
    "kobler til med OAuth service principal, bygger spørringen, transformerer rader, " +
      "gjenbruker tilkoblingen og lukkes korrekt ved avslutning",
    async () => {
      const spy = createSpyClient([BASE, { ...BASE, lokalid: null }]);
      const source = createDatabricksSource(() => spy.client);

      const firstRun = await drain(source.documents(TS));

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

      // Spørringen henter nøyaktig COLUMNS fra riktig tabell, med hvert ledd
      // av katalog.skjema.tabell backtick-kvotert hver for seg.
      const expectedSelect = COLUMNS.map((c) => `\`${c}\``).join(", ");
      expect(spy.executeStatementCalls).toEqual([
        `select ${expectedSelect} from \`catalog\`.\`skjema\`.\`matrikkel_adresse\``,
      ]);
      expect(spy.iterateRowsCalls).toEqual([{ maxRows: ROWS_PER_BATCH_FROM_DATABRICKS }]);

      // Rader transformeres via rowToDocument; raden uten lokalid hoppes over.
      expect(firstRun).toHaveLength(1);
      expect(firstRun[0]?.lokalid).toBe("12345");

      // Operasjonen lukkes etter kjøringen.
      expect(spy.operationCloseCalls()).toBe(1);

      // Andre kjøring skal gjenbruke samme tilkobling - ikke koble til på nytt.
      const secondRun = await drain(source.documents(TS));
      expect(secondRun).toHaveLength(1);
      expect(spy.connectCalls).toHaveLength(1);
      expect(spy.executeStatementCalls).toHaveLength(2);
      expect(spy.operationCloseCalls()).toBe(2);

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

    await expect(drain(source.documents(TS))).rejects.toThrow(/Ugyldig DATABRICKS_TABLE/);

    expect(spy.executeStatementCalls).toHaveLength(0);
    expect(spy.connectCalls).toHaveLength(0);

    process.env.DATABRICKS_TABLE = "catalog.skjema.matrikkel_adresse";
  });

  it("godtar katalognavn med bindestrek (Unity Catalog), hvert ledd backtick-kvotert", async () => {
    const spy = createSpyClient([BASE]);
    const source = createDatabricksSource(() => spy.client);
    process.env.DATABRICKS_TABLE =
      "eiendom_matrikkelen-adresse.3_gold_schema.matrikkel_adressesok_produkt_gold";

    await drain(source.documents(TS));

    const expectedSelect = COLUMNS.map((c) => `\`${c}\``).join(", ");
    expect(spy.executeStatementCalls).toEqual([
      `select ${expectedSelect} from \`eiendom_matrikkelen-adresse\`.\`3_gold_schema\`.\`matrikkel_adressesok_produkt_gold\``,
    ]);

    process.env.DATABRICKS_TABLE = "catalog.skjema.matrikkel_adresse";
  });
});
