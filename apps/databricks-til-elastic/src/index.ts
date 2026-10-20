import { ENVIRONMENT, Environment } from "./config";
import { createDatabricksSource } from "./databricks";
import { createFakeDatabricksClient } from "./databricks.mock";
import { es } from "./elastic";
import { logger } from "./logger";
import { runLoad } from "./runner";
import { CheckFailed } from "./verify-index";

const source =
  ENVIRONMENT === Environment.DEVELOPMENT
    ? createDatabricksSource(createFakeDatabricksClient)
    : createDatabricksSource();

try {
  await runLoad(source);
} catch (error) {
  if (error instanceof CheckFailed) {
    logger.error({ reason: error.message }, "avvist av fornuftssjekk, aliaset er ikke byttet");
  } else {
    logger.error({ err: error }, "kjøring feilet, aliaset er ikke byttet");
  }
  process.exitCode = 1;
} finally {
  await source.close().catch((err) => logger.warn({ err }, "klarte ikke lukke kilden"));
  await es.close().catch((err) => logger.warn({ err }, "klarte ikke lukke ES-klienten"));
}
