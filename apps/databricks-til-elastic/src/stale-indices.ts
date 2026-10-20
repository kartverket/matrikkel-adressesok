import { INDEX_PREFIX } from "./config";
import { indexTimestamp } from "./index-name";
import { logger } from "./logger";

const STALE_AFTER_MS = 48 * 60 * 60 * 1000;

export async function cleanUpStaleIndices(activeIndex: string): Promise<void> {
  try {
    const { deleteIndices, es } = await import("./elastic");
    const indices = await es.indices.get({
      index: `${INDEX_PREFIX}-*`,
      allow_no_indices: true,
      ignore_unavailable: true,
    });
    const stale = staleIndicesWithoutAlias(indices, new Date()).filter(
      (index) => index !== activeIndex,
    );
    await deleteIndices(stale);
    logger.info({ deletedIndices: stale }, "ryddet gamle indekser uten alias");
  } catch (err) {
    logger.warn({ err }, "klarte ikke rydde gamle indekser uten alias");
  }
}

export function staleIndicesWithoutAlias(
  indices: Record<string, { aliases?: Record<string, unknown> }>,
  now: Date,
): string[] {
  const cutoff = now.getTime() - STALE_AFTER_MS;

  return Object.entries(indices)
    .filter(([index, details]) => {
      if (Object.keys(details.aliases ?? {}).length > 0) return false;
      const createdAt = indexTimestamp(index);
      return createdAt !== null && createdAt <= cutoff;
    })
    .map(([index]) => index);
}
