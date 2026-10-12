import { DBSQLClient } from "@databricks/sql";
import { getRequiredEnvVar, ROWS_PER_BATCH_FROM_DATABRICKS } from "./config";
import { logger } from "./logger";
import { type AddressDocument, COLUMNS, type DatabricksRow } from "./schema";
import { rowToDocument } from "./transform";

type Operation = {
  iterateRows(options: { maxRows?: number }): AsyncIterable<object>;
  close(): Promise<unknown>;
};
type Session = {
  executeStatement(query: string): Promise<Operation>;
  close(): Promise<unknown>;
};

/**
 * Det databricks.ts faktisk bruker av en @databricks/sql-klient. En ekte
 * `DBSQLClient` oppfyller dette automatisk - i dev/test kan en falsk klient
 * (se databricks.mock.ts) settes inn i stedet, slik at samme spørrings-,
 * transformasjons- og oppryddingslogikk kjøres uten et ekte warehouse.
 */
export interface MinimalDatabricksClient {
  connect(options: Record<string, unknown>): Promise<{ openSession(): Promise<Session> }>;
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

  function getSession(): Promise<Session> {
    if (!session) {
      session = client
        .connect({
          host: getRequiredEnvVar("DATABRICKS_HOST"),
          path: getRequiredEnvVar("DATABRICKS_HTTP_PATH"),
          authType: "databricks-oauth",
          // OAuth M2M (client credentials) med en service principal. Klienten
          // ber da automatisk om scope "all-apis" - det er det eneste gyldige
          // scopet for M2M, se @databricks/sql sin DatabricksOAuthManager.
          oauthClientId: getRequiredEnvVar("DATABRICKS_CLIENT_ID"),
          oauthClientSecret: getRequiredEnvVar("DATABRICKS_CLIENT_SECRET"),
        })
        .then((c) => c.openSession())
        .catch((err) => {
          session = undefined;
          throw err;
        });
    }
    return session;
  }

  /**
   * Ingen join, ingen omskriving av kodeverdier: tabellen velges rett ut slik
   * den ligger i Databricks.
   */
  async function* documents(timestamp: string): AsyncGenerator<AddressDocument> {
    const table = getRequiredEnvVar("DATABRICKS_TABLE");
    throwIfInvalidTableName(table);

    const select = COLUMNS.map((c) => `\`${c}\``).join(", ");
    const query = `select ${select} from ${table}`;

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
    await sessionPromise.then((s) => s.close()).catch(() => undefined);
  }

  return { documents, close };
}

function throwIfInvalidTableName(table: string): void {
  if (!/^[\w.]+$/.test(table)) throw new Error(`Ugyldig DATABRICKS_TABLE: ${table}`);
}

const defaultSource = createDatabricksSource();
export const documents = defaultSource.documents;
export const close = defaultSource.close;
