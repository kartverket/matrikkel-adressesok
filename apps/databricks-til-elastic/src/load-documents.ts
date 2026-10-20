import { getRequiredEnvVar, PROGRESS_LOG_PERCENT_STEP } from "./config";
import type { DatabricksSource } from "./databricks";
import { createIndex, es } from "./elastic";
import { logger } from "./logger";
import type { AddressDocument, DatabricksRow } from "./schema";
import { rowToDocument } from "./transform";

export async function loadDocuments(index: string, source: DatabricksSource, timestamp: string) {
  const table = getRequiredEnvVar("DATABRICKS_TABLE");
  const totalRows = await source.countRows();
  logger.info({ table, totalRows }, "antall rader å hente");
  await createIndex(index);

  let rowsRead = 0;
  let lastLoggedPercent = 0;
  async function* countedDocuments(): AsyncGenerator<AddressDocument> {
    for await (const document of docs(source.rows(), timestamp)) {
      rowsRead++;
      lastLoggedPercent = logProgress(table, rowsRead, totalRows, lastLoggedPercent);
      yield document;
    }
    if (rowsRead !== totalRows) {
      throw new Error(`Leste ${rowsRead} rader fra ${table}, forventet ${totalRows}`);
    }
    logger.info({ table, rows: rowsRead, totalRows }, "tabell lest");
  }

  const bulkStats = await es.helpers.bulk({
    datasource: countedDocuments(),
    concurrency: 1,
    onDocument: (doc) => ({ index: { _index: index, _id: doc.uuid } }),
    onDrop: (doc) =>
      logger.error({ uuid: doc.document.uuid, reason: doc.error?.reason }, "dokument avvist"),
  });
  logger.info(
    {
      documentsAccepted: bulkStats.successful,
      documentsRejected: bulkStats.failed,
      retries: bulkStats.retry,
      durationSeconds: Math.round(bulkStats.time / 1000),
      dataMegabytes: Number((bulkStats.bytes / 1024 / 1024).toFixed(1)),
    },
    "lasting ferdig",
  );
  return bulkStats;
}

function logProgress(
  table: string,
  rowsRead: number,
  totalRows: number,
  lastLoggedPercent: number,
): number {
  if (totalRows === 0) return lastLoggedPercent;
  const percent = Math.floor((rowsRead / totalRows) * 100);
  const bucket = Math.floor(percent / PROGRESS_LOG_PERCENT_STEP) * PROGRESS_LOG_PERCENT_STEP;
  if (bucket > lastLoggedPercent && percent < 100) {
    logger.info({ table, rowsRead, totalRows, percent: bucket }, "leser fra Databricks");
  }
  return bucket;
}

async function* docs(
  rows: AsyncIterable<DatabricksRow>,
  timestamp: string,
): AsyncGenerator<AddressDocument> {
  for await (const row of rows) yield rowToDocument(row, timestamp);
}
