import { CheckFailed } from "./check";
import { logger } from "./logger";
import { kjørLasting, lukkKlienter } from "./runner";

try {
  await kjørLasting();
} catch (feil) {
  if (feil instanceof CheckFailed) {
    logger.error({ årsak: feil.message }, "avvist av fornuftssjekk, aliaset er ikke byttet");
  } else {
    logger.error({ err: feil }, "kjøring feilet, aliaset er ikke byttet");
  }
  process.exitCode = 1;
} finally {
  await lukkKlienter();
}
