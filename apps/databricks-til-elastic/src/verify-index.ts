import {
  ENVIRONMENT,
  Environment,
  MAX_ALLOWED_DEVIATION_PERCENT_FROM_PREVIOUS_INDEX,
  MINIMUM_DOCUMENT_COUNT_FOR_SUCCESSFUL_LOAD,
} from "./config";
import { logger } from "./logger";

export class CheckFailed extends Error {
  override readonly name = "CheckFailed";
}

export function relativeDeviationPercent(newValue: number, previousValue: number): number {
  if (previousValue === 0) return newValue === 0 ? 0 : 100;
  return (Math.abs(newValue - previousValue) / previousValue) * 100;
}

export interface Counts {
  acceptedByBulkHelper: number;
  rejectedByElasticsearch: number;
  documentsInNewIndex: number;
  documentsInPreviousIndex: number;
}

const minimumDocumentCount =
  ENVIRONMENT === Environment.DEVELOPMENT ? 1 : MINIMUM_DOCUMENT_COUNT_FOR_SUCCESSFUL_LOAD;

export async function verifyIndex(
  newIndex: string,
  previousIndices: string[],
  bulkStats: { successful: number; failed: number },
): Promise<number> {
  const { docCount } = await import("./elastic");
  const documentsInNewIndex = await docCount(newIndex);
  const documentsInPreviousIndex = previousIndices.length ? await docCount(previousIndices) : 0;
  const deviationPercent = relativeDeviationPercent(documentsInNewIndex, documentsInPreviousIndex);
  logger.info(
    {
      documentsInNewIndex,
      documentsInPreviousIndex,
      deviationPercent: Number(deviationPercent.toFixed(2)),
    },
    "sammenligner med gammel indeks",
  );
  assertHealthy(
    {
      acceptedByBulkHelper: bulkStats.successful,
      rejectedByElasticsearch: bulkStats.failed,
      documentsInNewIndex,
      documentsInPreviousIndex,
    },
    minimumDocumentCount,
  );
  return documentsInNewIndex;
}

export function assertHealthy(
  {
    acceptedByBulkHelper,
    rejectedByElasticsearch,
    documentsInNewIndex,
    documentsInPreviousIndex,
  }: Counts,
  minimumCount = MINIMUM_DOCUMENT_COUNT_FOR_SUCCESSFUL_LOAD,
): void {
  if (rejectedByElasticsearch > 0) {
    throw new CheckFailed(`${rejectedByElasticsearch} dokumenter ble avvist`);
  }
  if (documentsInNewIndex !== acceptedByBulkHelper) {
    throw new CheckFailed(
      `indeksen har ${documentsInNewIndex} dokumenter, forventet ${acceptedByBulkHelper}`,
    );
  }
  if (documentsInNewIndex < minimumCount) {
    throw new CheckFailed(
      `bare ${documentsInNewIndex} dokumenter, forventet minst ${minimumCount}`,
    );
  }

  const deviationPercent = relativeDeviationPercent(documentsInNewIndex, documentsInPreviousIndex);
  if (
    documentsInPreviousIndex > 0 &&
    deviationPercent > MAX_ALLOWED_DEVIATION_PERCENT_FROM_PREVIOUS_INDEX
  ) {
    throw new CheckFailed(`${deviationPercent.toFixed(1)} % avvik fra gammel indeks`);
  }
}
