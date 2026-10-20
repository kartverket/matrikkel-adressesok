import { assertHealthy, relativeDeviationPercent } from "./check";
import { getRequiredEnvVar, PROGRESS_LOG_PERCENT_STEP } from "./config";
import { createDatabricksSource } from "./databricks";
import { createFakeDatabricksClient } from "./databricks.mock";
import {
  createIndex,
  deleteStaleIndicesWithoutAlias,
  docCount,
  es,
  indicesWithAlias,
  loadDocumentStream,
  makeIndexSearchable,
  newIndexName,
  swapAliasAtomically,
} from "./elastic";
import { logger } from "./logger";
import type { AddressDocument, DatabricksRow } from "./schema";
import { rowToDocument } from "./transform";

const source =
  process.env.DATABRICKS_MOCK === "true"
    ? createDatabricksSource(createFakeDatabricksClient)
    : createDatabricksSource();

export async function runLoad(): Promise<void> {
  const runStartedAt = new Date();
  const newIndex = newIndexName(runStartedAt);
  const timestamp = runStartedAt.toISOString();

  const previousIndicesWithAlias = await indicesWithAlias();
  logger.info({ newIndex, previousIndicesWithAlias }, "starter");

  const totalRows = await source.countRows();
  logger.info({ table: getRequiredEnvVar("DATABRICKS_TABLE"), totalRows }, "antall rader å hente");
  await createIndex(newIndex);
  const documents = transformRowsWithProgress(source.rows(), timestamp, totalRows);
  const bulkStats = await loadDocumentStream(newIndex, documents);
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

  await makeIndexSearchable(newIndex);

  const documentsInNewIndex = await docCount(newIndex);
  const documentsInPreviousIndex = previousIndicesWithAlias.length
    ? await docCount(previousIndicesWithAlias)
    : 0;
  const deviationPercent = relativeDeviationPercent(documentsInNewIndex, documentsInPreviousIndex);
  logger.info(
    {
      documentsInNewIndex,
      documentsInPreviousIndex,
      deviationPercent: Number(deviationPercent.toFixed(2)),
    },
    "sammenligner med gammel indeks",
  );

  assertHealthy({
    acceptedByBulkHelper: bulkStats.successful,
    rejectedByElasticsearch: bulkStats.failed,
    documentsInNewIndex,
    documentsInPreviousIndex,
  });

  await swapAliasAtomically(newIndex, previousIndicesWithAlias);
  logger.info({ newIndex, documentsInNewIndex }, "alias byttet, ferdig");

  try {
    const deletedIndices = await deleteStaleIndicesWithoutAlias(new Date(), newIndex);
    logger.info({ deletedIndices }, "ryddet gamle indekser uten alias");
  } catch (err) {
    logger.warn({ err }, "klarte ikke rydde gamle indekser uten alias");
  }
}

export async function closeClients(): Promise<void> {
  await source
    .close()
    .catch((closeError) => logger.warn({ err: closeError }, "klarte ikke lukke kilden"));
  await es
    .close()
    .catch((closeError) => logger.warn({ err: closeError }, "klarte ikke lukke ES-klienten"));
}

async function* transformRowsWithProgress(
  rows: AsyncIterable<DatabricksRow>,
  timestamp: string,
  totalRows: number,
): AsyncGenerator<AddressDocument> {
  const table = getRequiredEnvVar("DATABRICKS_TABLE");
  let rowsRead = 0;
  let lastLoggedPercent = 0;

  for await (const row of rows) {
    rowsRead++;
    lastLoggedPercent = logProgress(table, rowsRead, totalRows, lastLoggedPercent);

    yield rowToDocument(row, timestamp);
  }

  if (rowsRead !== totalRows) {
    throw new Error(`Leste ${rowsRead} rader fra ${table}, forventet ${totalRows}`);
  }
  logger.info({ table, rows: rowsRead, totalRows }, "tabell lest");
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
