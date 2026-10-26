import { DBSQLClient } from "@databricks/sql";
import type {
  ConnectionOptions,
  OpenSessionRequest,
} from "@databricks/sql/dist/contracts/IDBSQLClient";
import type { ExecuteStatementOptions } from "@databricks/sql/dist/contracts/IDBSQLSession";
import type { IteratorOptions } from "@databricks/sql/dist/contracts/IOperation";
import { z } from "zod";
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

const CredentialsSchema = z.object({
  client_id: z.string().min(1),
  client_secret: z.string().min(1),
});

function getCredentials(): z.infer<typeof CredentialsSchema> {
  const raw = getRequiredEnvVar("DATABRICKS_CLIENT_SECRET");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("DATABRICKS_CLIENT_SECRET må være gyldig JSON med client_id og client_secret");
  }
  const result = CredentialsSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error("DATABRICKS_CLIENT_SECRET må inneholde client_id og client_secret");
  }
  return result.data;
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
      const credentials = getCredentials();
      const connection = await client.connect({
        host: getRequiredEnvVar("DATABRICKS_HOST"),
        path: getRequiredEnvVar("DATABRICKS_HTTP_PATH"),
        authType: "databricks-oauth",
        oauthScopes: ["all-apis"],
        oauthClientId: credentials.client_id,
        oauthClientSecret: credentials.client_secret,
      });
      return await connection.openSession();
    } catch (err) {
      session = undefined;
      logger.error({ err }, "klarte ikke opprette Databricks-session");
      throw err;
    }
  }

  async function countRows(): Promise<number> {
    const table = getTable();
    const sql = await getSession();
    const operation = await sql.executeStatement(`select count(*) as total from ${table}`);
    try {
      for await (const row of operation.iterateRows({ maxRows: 1 })) {
        const total = (row as { total?: unknown }).total;
        if (typeof total !== "number" || !Number.isSafeInteger(total) || total < 0) {
          throw new Error(`Ugyldig antall rader fra Databricks-tabellen ${table}`);
        }
        return total;
      }
      throw new Error(`Mangler antall rader fra Databricks-tabellen ${table}`);
    } finally {
      await closeOperation(operation, table);
    }
  }

  async function* rows(): AsyncGenerator<DatabricksRow> {
    const table = getTable();
    const sql = await getSession();

    const operation = await sql.executeStatement(buildRowsQuery(table), {
      // Avoid expiring CloudFetch links during long-running index loads.
      useCloudFetch: false,
    });
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

export function buildRowsQuery(table: string): string {
  const select = COLUMNS.join(", ");
  return `select ${select} from ${table} order by adressetekst asc, uuid asc`;
}

function getTable(): string {
  const table = getRequiredEnvVar("DATABRICKS_TABLE");
  throwIfInvalidTableName(table);
  return table
    .split(".")
    .map((part) => `\`${part}\``)
    .join(".");
}

function throwIfInvalidTableName(table: string): void {
  // Tabellnavnet brukes i SQL og må valideres for å hindre SQL-injeksjon.
  if (!/^[\w-]+(\.[\w-]+)*$/.test(table)) {
    throw new Error(`Ugyldig DATABRICKS_TABLE: ${table}`);
  }
}
