import { createLogger } from "@matrikkel/shared-logging";

export const logger = createLogger({
  base: { app: "databricks-til-elastic", run_id: crypto.randomUUID() },
});
