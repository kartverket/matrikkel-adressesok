import { describe, expect, it, mock } from "bun:test";
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

function createMockClient(
  rowsToYield: DatabricksRow[],
  countRows: object[] = [{ total: rowsToYield.length }],
) {
  const operationClose = mock(async () => {});
  const sessionClose = mock(async () => {});
  const clientClose = mock(async () => {});
  const iterateRows = mock((_opts: { maxRows?: number }, rows: object[]) =>
    (async function* () {
      for (const row of rows) yield row;
    })(),
  );
  const executeStatement = mock(async (query: string) => {
    const rows: object[] = query.startsWith("select count(*)") ? countRows : rowsToYield;
    return {
      iterateRows: (opts: { maxRows?: number }) => iterateRows(opts, rows),
      close: operationClose,
    };
  });
  const connect = mock(async (_options: Parameters<MinimalDatabricksClient["connect"]>[0]) => ({
    openSession: async () => ({ executeStatement, close: sessionClose }),
  }));

  const client: MinimalDatabricksClient = {
    connect,
    close: clientClose,
  };

  return {
    client,
    connect,
    executeStatement,
    iterateRows,
    operationClose,
    sessionClose,
    clientClose,
  };
}

async function drain<T>(generator: AsyncGenerator<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of generator) items.push(item);
  return items;
}

describe("createDatabricksSource mot @databricks/sql (injisert falsk klient)", () => {
  it("leser numerisk antall fra Databricks", async () => {
    const client = createMockClient([BASE]);
    const source = createDatabricksSource(() => client.client);
    expect(await source.countRows()).toBe(1);
    await source.close();
  });

  it("feiler når tellingen ikke gir et gyldig antall, og lukker operasjonen", async () => {
    for (const result of [
      [],
      [{ total: null }],
      [{ total: "1" }],
      [{ total: -1 }],
      [{ total: 1.5 }],
      [{ total: Number.MAX_SAFE_INTEGER + 1 }],
    ]) {
      const client = createMockClient([BASE], result);
      const source = createDatabricksSource(() => client.client);
      expect(source.countRows()).rejects.toThrow(/antall rader/);
      expect(client.operationClose).toHaveBeenCalledTimes(1);
      await source.close();
    }
  });

  it(
    "kobler til med OAuth service principal, bygger spørringene og leser rader, " +
      "gjenbruker tilkoblingen og lukkes korrekt ved avslutning",
    async () => {
      const client = createMockClient([BASE, { ...BASE, uuid: null }]);
      const source = createDatabricksSource(() => client.client);

      expect(await source.countRows()).toBe(2);
      const firstRun = await drain(source.rows());

      // Autentisering: OAuth client-credentials med service principal - ikke
      // personal access token.
      expect(client.connect.mock.calls.map(([options]) => options)).toEqual([
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
      const expectedSelect = COLUMNS.join(", ");
      const expectedTable = "`catalog`.`skjema`.`matrikkel_adresse`";
      expect(client.executeStatement.mock.calls.map(([query]) => query)).toEqual([
        `select count(*) as total from ${expectedTable}`,
        `select ${expectedSelect} from ${expectedTable}`,
      ]);
      expect(client.iterateRows.mock.calls.map(([options]) => options)).toEqual([
        { maxRows: 1 },
        { maxRows: ROWS_PER_BATCH_FROM_DATABRICKS },
      ]);

      expect(firstRun).toHaveLength(2);
      expect(firstRun[0]?.uuid).toBe("12345");
      expect(firstRun[1]?.uuid).toBeNull();

      // Begge operasjonene (count og select) lukkes etter kjøringen.
      expect(client.operationClose).toHaveBeenCalledTimes(2);

      // Andre kjøring skal gjenbruke samme tilkobling - ikke koble til på nytt.
      expect(await source.countRows()).toBe(2);
      const secondRun = await drain(source.rows());
      expect(secondRun).toHaveLength(2);
      expect(client.connect).toHaveBeenCalledTimes(1);
      expect(client.executeStatement).toHaveBeenCalledTimes(4);
      expect(client.operationClose).toHaveBeenCalledTimes(4);

      // Avslutning: close() skal lukke både session og klient.
      await source.close();
      expect(client.sessionClose).toHaveBeenCalledTimes(1);
      expect(client.clientClose).toHaveBeenCalledTimes(1);
    },
  );

  it("avviser ugyldig tabellnavn før noen spørring sendes til Databricks", async () => {
    const client = createMockClient([BASE]);
    const source = createDatabricksSource(() => client.client);
    process.env.DATABRICKS_TABLE = "matrikkel_adresse; drop table x --";

    await expect(source.countRows()).rejects.toThrow(/Ugyldig DATABRICKS_TABLE/);

    expect(client.executeStatement).not.toHaveBeenCalled();
    expect(client.connect).not.toHaveBeenCalled();

    process.env.DATABRICKS_TABLE = "catalog.skjema.matrikkel_adresse";
  });

  it("godtar katalognavn med bindestrek (Unity Catalog), hvert ledd backtick-kvotert", async () => {
    const client = createMockClient([BASE]);
    const source = createDatabricksSource(() => client.client);
    process.env.DATABRICKS_TABLE =
      "eiendom_matrikkelen-adresse.3_gold_schema.matrikkel_adressesok_produkt_gold";

    await source.countRows();
    await drain(source.rows());

    const expectedSelect = COLUMNS.join(", ");
    const expectedTable =
      "`eiendom_matrikkelen-adresse`.`3_gold_schema`.`matrikkel_adressesok_produkt_gold`";
    expect(client.executeStatement.mock.calls.map(([query]) => query)).toEqual([
      `select count(*) as total from ${expectedTable}`,
      `select ${expectedSelect} from ${expectedTable}`,
    ]);

    process.env.DATABRICKS_TABLE = "catalog.skjema.matrikkel_adresse";
  });
});
