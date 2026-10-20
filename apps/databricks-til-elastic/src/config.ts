export enum Environment {
  DEVELOPMENT = "DEVELOPMENT",
  PRODTEST = "PRODTEST",
  PROD = "PROD",
}

export function parseEnvironment(value: string): Environment {
  switch (value) {
    case Environment.DEVELOPMENT:
    case Environment.PRODTEST:
    case Environment.PROD:
      return value;
    default:
      throw new Error(`Ugyldig ENVIRONMENT: ${value}`);
  }
}

export const ENVIRONMENT = parseEnvironment(process.env.ENVIRONMENT ?? Environment.DEVELOPMENT);

export function indexSuffixForEnvironment(environment: Environment): string {
  return `-${environment.toLowerCase()}`;
}

const integrationTestId = process.env.INTEGRATION_TEST_ID;
if (
  integrationTestId !== undefined &&
  (ENVIRONMENT !== Environment.DEVELOPMENT || !/^[a-z0-9]+$/.test(integrationTestId))
) {
  throw new Error("INTEGRATION_TEST_ID kan bare være alfanumerisk og brukes i DEVELOPMENT");
}

const indexSuffix = `${indexSuffixForEnvironment(ENVIRONMENT)}${integrationTestId ? `-test-${integrationTestId}` : ""}`;
export const ALIAS =
  ENVIRONMENT === Environment.PROD ? "ed_adressesok" : `ed_adressesok${indexSuffix}`;
export const INDEX_PREFIX = `ed_adressesok_v1${indexSuffix}`;

export const ROWS_PER_BATCH_FROM_DATABRICKS = 5_000;
export const PROGRESS_LOG_PERCENT_STEP = 5;

export const NUMBER_OF_REPLICAS = 1;

export const MAX_ALLOWED_DEVIATION_PERCENT_FROM_PREVIOUS_INDEX = 10;
export const MINIMUM_DOCUMENT_COUNT_FOR_SUCCESSFUL_LOAD = 1000;

export function getRequiredEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Mangler miljøvariabel ${name}`);
  return value;
}
