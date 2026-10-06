const indexSuffixForEnvironmentIsolation = process.env.INDEX_SUFFIX ?? "";

export const ALIAS = `ed_adressesok${indexSuffixForEnvironmentIsolation}`;
export const INDEX_PREFIX = `ed_adressesok_v1${indexSuffixForEnvironmentIsolation}`;

export const ROWS_PER_BATCH_FROM_DATABRICKS = 1000;
export const NUMBER_OF_REPLICAS = 1;

export const MAX_ALLOWED_DEVIATION_PERCENT_FROM_PREVIOUS_INDEX = 10;
export const MINIMUM_DOCUMENT_COUNT_FOR_SUCCESSFUL_LOAD = 1000;

export function getRequiredEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Mangler miljøvariabel ${name}`);
  return value;
}
