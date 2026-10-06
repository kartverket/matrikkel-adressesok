import {
  MAX_ALLOWED_DEVIATION_PERCENT_FROM_PREVIOUS_INDEX,
  MINIMUM_DOCUMENT_COUNT_FOR_SUCCESSFUL_LOAD,
} from "./config";

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

export function assertHealthy({
  acceptedByBulkHelper,
  rejectedByElasticsearch,
  documentsInNewIndex,
  documentsInPreviousIndex,
}: Counts): void {
  if (rejectedByElasticsearch > 0) {
    throw new CheckFailed(`${rejectedByElasticsearch} dokumenter ble avvist`);
  }
  if (documentsInNewIndex !== acceptedByBulkHelper) {
    throw new CheckFailed(
      `indeksen har ${documentsInNewIndex} dokumenter, forventet ${acceptedByBulkHelper}`,
    );
  }
  if (documentsInNewIndex < MINIMUM_DOCUMENT_COUNT_FOR_SUCCESSFUL_LOAD) {
    throw new CheckFailed(
      `bare ${documentsInNewIndex} dokumenter, forventet minst ${MINIMUM_DOCUMENT_COUNT_FOR_SUCCESSFUL_LOAD}`,
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
