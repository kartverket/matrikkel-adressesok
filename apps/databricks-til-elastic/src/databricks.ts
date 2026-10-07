import { DBSQLClient } from "@databricks/sql";
import { getRequiredEnvVar, ROWS_PER_BATCH_FROM_DATABRICKS } from "./config";
import { logger } from "./logger";
import { type AddressDocument, COLUMNS, type DatabricksRow } from "./schema";
import { rowToDocument } from "./transform";

type Session = Awaited<ReturnType<DBSQLClient["openSession"]>>;

const client = new DBSQLClient();
let session: Promise<Session> | undefined;

function getSession(): Promise<Session> {
  if (!session) {
    session = client
      .connect({
        host: getRequiredEnvVar("DATABRICKS_HOST"),
        path: getRequiredEnvVar("DATABRICKS_HTTP_PATH"),
        token: getRequiredEnvVar("DATABRICKS_TOKEN"),
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
export async function* documents(timestamp: string): AsyncGenerator<AddressDocument> {
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

function throwIfInvalidTableName(table: string): void {
  if (!/^[\w.]+$/.test(table)) throw new Error(`Ugyldig DATABRICKS_TABLE: ${table}`);
}

async function closeOperation(
  operation: Awaited<ReturnType<Session["executeStatement"]>>,
  table: string,
): Promise<void> {
  await operation
    .close()
    .catch((err) => logger.warn({ err, table }, "klarte ikke lukke Databricks-operasjonen"));
}

export async function close(): Promise<void> {
  if (session) await closeSession(session);
  await client.close();
}

async function closeSession(sessionPromise: Promise<Session>): Promise<void> {
  await sessionPromise.then((s) => s.close()).catch(() => undefined);
}
