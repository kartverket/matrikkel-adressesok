import { DBSQLClient } from "@databricks/sql";
import { ANTALL_RADER_PER_PORSJON_FRA_DATABRICKS, hentPåkrevdMiljøvariabel } from "./config";
import { logger } from "./logger";
import { type AddressDocument, COLUMNS, type DatabricksRow } from "./schema";
import { radTilDokument } from "./transform";

type Session = Awaited<ReturnType<DBSQLClient["openSession"]>>;

const client = new DBSQLClient();
let session: Promise<Session> | undefined;

function hentSesjon(): Promise<Session> {
  if (!session) {
    session = client
      .connect({
        host: hentPåkrevdMiljøvariabel("DATABRICKS_HOST"),
        path: hentPåkrevdMiljøvariabel("DATABRICKS_HTTP_PATH"),
        token: hentPåkrevdMiljøvariabel("DATABRICKS_TOKEN"),
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
  const table = hentPåkrevdMiljøvariabel("DATABRICKS_TABLE");
  kastHvisUgyldigTabellnavn(table);

  const select = COLUMNS.map((c) => `\`${c}\``).join(", ");
  const query = `select ${select} from ${table}`;

  const sql = await hentSesjon();
  const operation = await sql.executeStatement(query);

  let rows = 0;
  try {
    for await (const row of operation.iterateRows({
      maxRows: ANTALL_RADER_PER_PORSJON_FRA_DATABRICKS,
    })) {
      const doc = radTilDokument(row as DatabricksRow, timestamp);
      if (doc) yield doc;
      else logger.warn({ table }, "rad uten lokalid, hoppet over");
      rows++;
    }
  } finally {
    await lukkOperasjon(operation, table);
  }
  logger.info({ table, rows }, "tabell lest");
}

function kastHvisUgyldigTabellnavn(table: string): void {
  if (!/^[\w.]+$/.test(table)) throw new Error(`Ugyldig DATABRICKS_TABLE: ${table}`);
}

async function lukkOperasjon(
  operation: Awaited<ReturnType<Session["executeStatement"]>>,
  table: string,
): Promise<void> {
  await operation
    .close()
    .catch((err) => logger.warn({ err, table }, "klarte ikke lukke Databricks-operasjonen"));
}

export async function close(): Promise<void> {
  if (session) await lukkSesjon(session);
  await client.close();
}

async function lukkSesjon(økt: Promise<Session>): Promise<void> {
  await økt.then((s) => s.close()).catch(() => undefined);
}
