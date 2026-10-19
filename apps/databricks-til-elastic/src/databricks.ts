import { DBSQLClient } from "@databricks/sql";
import type {
  ConnectionOptions,
  OpenSessionRequest,
} from "@databricks/sql/dist/contracts/IDBSQLClient";
import type { ExecuteStatementOptions } from "@databricks/sql/dist/contracts/IDBSQLSession";
import type { IteratorOptions } from "@databricks/sql/dist/contracts/IOperation";
import { getRequiredEnvVar, ROWS_PER_BATCH_FROM_DATABRICKS } from "./config";
import { logger } from "./logger";
import { COLUMNS, type DatabricksRow } from "./schema";

type Operation = {
  iterateRows(options: IteratorOptions): AsyncIterable<object>;
  close(): Promise<unknown>;
};

type Session = {
  executeStatement(query: string, options?: ExecuteStatementOptions): Promise<Operation>;
  close(): Promise<unknown>;
};

export interface MinimalDatabricksClient {
  connect(
    options: ConnectionOptions,
  ): Promise<{ openSession(request?: OpenSessionRequest): Promise<Session> }>;
  close(): Promise<unknown>;
}

export interface DatabricksSource {
  countRows(): Promise<number>;
  rows(): AsyncGenerator<DatabricksRow>;
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

  async function countRows(): Promise<number> {
    const { table, qualified } = getTable();
    const sql = await getSession();
    const operation = await sql.executeStatement(`select count(*) as total from ${qualified}`);
    try {
      for await (const row of operation.iterateRows({ maxRows: 1 })) {
        return parseRowCount((row as { total?: unknown }).total, table);
      }
      throw new Error(`Mangler antall rader fra Databricks-tabellen ${table}`);
    } finally {
      await closeOperation(operation, table);
    }
  }

  async function* rows(): AsyncGenerator<DatabricksRow> {
    const { table, qualified } = getTable();
    const select = COLUMNS.map((column) => `\`${column}\``).join(", ");
    const sql = await getSession();
    const operation = await sql.executeStatement(`select ${select} from ${qualified}`);
    try {
      for await (const row of operation.iterateRows({
        maxRows: ROWS_PER_BATCH_FROM_DATABRICKS,
      })) {
        yield row as DatabricksRow;
      }
    } finally {
      await closeOperation(operation, table);
    }
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
    } catch (err) {
      logger.warn({ err }, "klarte ikke lukke Databricks-session");
    }
  }

  return { countRows, rows, close };
}

function getTable(): { table: string; qualified: string } {
  const table = getRequiredEnvVar("DATABRICKS_TABLE");
  throwIfInvalidTableName(table);
  const qualified = table
    .split(".")
    .map((part) => `\`${part}\``)
    .join(".");
  return { table, qualified };
}

function parseRowCount(rawTotal: unknown, table: string): number {
  const validType =
    typeof rawTotal === "number" || (typeof rawTotal === "string" && /^\d+$/.test(rawTotal));
  const total = validType ? Number(rawTotal) : NaN;
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new Error(`Ugyldig antall rader fra Databricks-tabellen ${table}`);
  }
  return total;
}

function throwIfInvalidTableName(table: string): void {
  if (!/^[\w-]+(\.[\w-]+)*$/.test(table)) {
    throw new Error(`Ugyldig DATABRICKS_TABLE: ${table}`);
  }
}
