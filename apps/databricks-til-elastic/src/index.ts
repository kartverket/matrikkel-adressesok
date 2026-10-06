import { CheckFailed } from "./check";
import { logger } from "./logger";
import { closeClients, runLoad } from "./runner";

try {
  await runLoad();
} catch (error) {
  if (error instanceof CheckFailed) {
    logger.error({ reason: error.message }, "avvist av fornuftssjekk, aliaset er ikke byttet");
  } else {
    logger.error({ err: error }, "kjøring feilet, aliaset er ikke byttet");
  }
  process.exitCode = 1;
} finally {
  await closeClients();
}
