import { assertHealthy, relativeDeviationPercent } from "./check";
import * as databricks from "./databricks";
import * as databricksMock from "./databricks.mock";
import {
  createIndex,
  deleteIndices,
  docCount,
  es,
  indicesWithAlias,
  loadDocumentStream,
  makeIndexSearchable,
  newIndexName,
  swapAliasAtomically,
} from "./elastic";
import { logger } from "./logger";

function sourceForThisRun() {
  return process.env.DATABRICKS_MOCK === "true" ? databricksMock : databricks;
}

export async function runLoad(): Promise<void> {
  const runStartedAt = new Date();
  const newIndex = newIndexName(runStartedAt);
  const timestamp = runStartedAt.toISOString();
  const source = sourceForThisRun();

  const previousIndicesWithAlias = await indicesWithAlias();
  logger.info({ newIndex, previousIndicesWithAlias }, "starter");

  await createIndex(newIndex);
  const bulkStats = await loadDocumentStream(newIndex, source.documents(timestamp));
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

  if (previousIndicesWithAlias.length) {
    await deleteIndices(previousIndicesWithAlias).catch((deleteError) =>
      logger.warn(
        { err: deleteError, previousIndicesWithAlias },
        "klarte ikke slette gamle indekser",
      ),
    );
  }
}

export async function closeClients(): Promise<void> {
  await sourceForThisRun()
    .close()
    .catch((closeError) => logger.warn({ err: closeError }, "klarte ikke lukke kilden"));
  await es
    .close()
    .catch((closeError) => logger.warn({ err: closeError }, "klarte ikke lukke ES-klienten"));
}
