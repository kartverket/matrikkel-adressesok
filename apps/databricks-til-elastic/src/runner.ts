import type { DatabricksSource } from "./databricks";
import { indicesWithAlias, makeIndexSearchable, swapAliasAtomically } from "./elastic";
import { newIndexName } from "./index-name";
import { loadDocuments } from "./load-documents";
import { logger } from "./logger";
import { cleanUpStaleIndices } from "./stale-indices";
import { verifyIndex } from "./verify-index";

export async function runLoad(source: DatabricksSource): Promise<void> {
  const runStartedAt = new Date();
  const newIndex = newIndexName(runStartedAt);
  const previousIndicesWithAlias = await indicesWithAlias();
  logger.info({ newIndex, previousIndicesWithAlias }, "starter");

  const bulkStats = await loadDocuments(newIndex, source, runStartedAt.toISOString());
  await makeIndexSearchable(newIndex);
  const documentsInNewIndex = await verifyIndex(newIndex, previousIndicesWithAlias, bulkStats);

  await swapAliasAtomically(newIndex, previousIndicesWithAlias);
  logger.info({ newIndex, documentsInNewIndex }, "alias byttet, ferdig");
  await cleanUpStaleIndices(newIndex);
}
