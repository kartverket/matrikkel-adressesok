import { DBSQLClient } from "@databricks/sql";
import type {
  ConnectionOptions,
  OpenSessionRequest,
} from "@databricks/sql/dist/contracts/IDBSQLClient";
import type { ExecuteStatementOptions } from "@databricks/sql/dist/contracts/IDBSQLSession";
import type { IteratorOptions } from "@databricks/sql/dist/contracts/IOperation";
import { getRequiredEnvVar, ROWS_PER_BATCH_FROM_DATABRICKS } from "./config";
import { logger } from "./logger";
import { type AddressDocument, COLUMNS, type DatabricksRow } from "./schema";
import { rowToDocument } from "./transform";

/**
 * De delene av `@databricks/sql` sin `IOperation` vi faktisk bruker, typet
 * mot de ekte parametertypene (`IteratorOptions`) slik at kallene våre
 * valideres mot den reelle klient-APIen. En ekte `DBSQLClient`-operasjon har
 * langt flere metoder (`fetchAll`, `cancel`, `getSchema`, ...) og oppfyller
 * dette automatisk; i dev/test kan en falsk operasjon (se databricks.mock.ts)
 * nøye seg med bare disse to.
 */
type Operation = {
  iterateRows(options: IteratorOptions): AsyncIterable<object>;
  close(): Promise<unknown>;
};

/**
 * Tilsvarende delmengde av `IDBSQLSession`, typet mot de ekte
 * parameter-/returtypene.
 */
type Session = {
  executeStatement(query: string, options?: ExecuteStatementOptions): Promise<Operation>;
  close(): Promise<unknown>;
};

/**
 * Det databricks.ts faktisk bruker av en @databricks/sql-klient. En ekte
 * `DBSQLClient` oppfyller dette automatisk - i dev/test kan en falsk klient
 * (se databricks.mock.ts) settes inn i stedet, slik at samme spørrings-,
 * transformasjons- og oppryddingslogikk kjøres uten et ekte warehouse.
 *
 * `connect`/`openSession` er typet mot de ekte `ConnectionOptions`/
 * `OpenSessionRequest`-typene fra `@databricks/sql` i stedet for
 * `Record<string, unknown>`, slik at en feilstavet eller ugyldig
 * tilkoblingsopsjon feiler på kompileringstidspunktet.
 */
export interface MinimalDatabricksClient {
  connect(
    options: ConnectionOptions,
  ): Promise<{ openSession(request?: OpenSessionRequest): Promise<Session> }>;
  close(): Promise<unknown>;
}

export interface DatabricksSource {
  documents(timestamp: string): AsyncGenerator<AddressDocument>;
  close(): Promise<void>;
}

export function createDatabricksSource(
  clientFactory: () => MinimalDatabricksClient = () => new DBSQLClient(),
): DatabricksSource {
  const client = clientFactory();
  let session: Promise<Session> | undefined;

  async function getSession(): Promise<Session> {
    if (!session) {
      session = connectAndOpenSession();
    }
    return session;
  }

  async function connectAndOpenSession(): Promise<Session> {
    try {
      const connection = await client.connect({
        host: getRequiredEnvVar("DATABRICKS_HOST"),
        path: getRequiredEnvVar("DATABRICKS_HTTP_PATH"),
        authType: "databricks-oauth",
        oauthScopes: ["all-apis"],
        oauthClientId: getRequiredEnvVar("DATABRICKS_CLIENT_ID"),
        oauthClientSecret: getRequiredEnvVar("DATABRICKS_CLIENT_SECRET"),
      });
      return await connection.openSession();
    } catch (err) {
      session = undefined;
      logger.error({ err }, "klarte ikke opprette Databricks-session");
      throw err;
    }
  }

  /**
   * Ingen join, ingen omskriving av kodeverdier: tabellen velges rett ut slik
   * den ligger i Databricks.
   */
  async function* documents(timestamp: string): AsyncGenerator<AddressDocument> {
    const table = getRequiredEnvVar("DATABRICKS_TABLE");
    throwIfInvalidTableName(table);

    const select = COLUMNS.map((c) => `\`${c}\``).join(", ");
    // Hvert ledd i `katalog.skjema.tabell` kan inneholde tegn SQL ikke tillater
    // i ukvoterte identifikatorer (f.eks. bindestrek i katalognavn, eller et
    // ledd som starter med et siffer) - de må derfor backtick-kvoteres hver
    // for seg. throwIfInvalidTableName har allerede verifisert at hvert ledd
    // kun inneholder trygge tegn (bokstaver, tall, understrek, bindestrek).
    const qualifiedTable = table
      .split(".")
      .map((part) => `\`${part}\``)
      .join(".");
    const query = `select ${select} from ${qualifiedTable}`;

    logger.info({ query }, "kjører Databricks-spørring");

    const sql = await getSession();
    const operation = await sql.executeStatement(query);

    let rows = 0;
    try {
      for await (const row of operation.iterateRows({
        maxRows: ROWS_PER_BATCH_FROM_DATABRICKS,
      })) {
        const doc = rowToDocument(row as DatabricksRow, timestamp);
        if (doc) yield doc;
        else logger.warn({ table }, "rad uten lokalid, hoppet over");
        rows++;
      }
    } finally {
      await closeOperation(operation, table);
    }
    logger.info({ table, rows }, "tabell lest");
  }

  async function closeOperation(operation: Operation, table: string): Promise<void> {
    await operation
      .close()
      .catch((err) => logger.warn({ err, table }, "klarte ikke lukke Databricks-operasjonen"));
  }

  async function close(): Promise<void> {
    if (session) await closeSession(session);
    await client.close();
  }

  async function closeSession(sessionPromise: Promise<Session>): Promise<void> {
    try {
      const s = await sessionPromise;
      await s.close();
    } catch {
      // Feil ved tilkobling er allerede logget i connectAndOpenSession() -
      // her trenger vi bare å unngå en uhåndtert rejection ved opprydding.
    }
  }

  return { documents, close };
}

function throwIfInvalidTableName(table: string): void {
  // Fullt kvalifisert `katalog.skjema.tabell` - hvert ledd er bokstaver, tall,
  // understrek eller bindestrek (Unity Catalog-katalognavn kan inneholde
  // bindestrek, f.eks. `eiendom_matrikkelen-adresse.3_gold_schema.tabell`).
  if (!/^[\w-]+(\.[\w-]+)*$/.test(table)) {
    throw new Error(`Ugyldig DATABRICKS_TABLE: ${table}`);
  }
}
