import { describe, expect, test } from "bun:test";
import { createDatabricksSource, type MinimalDatabricksClient } from "../../src/databricks";

describe("Databricks source", () => {
  test("orders address rows by uuid for deterministic loading", async () => {
    const previousEnvironment = {
      DATABRICKS_HOST: process.env.DATABRICKS_HOST,
      DATABRICKS_HTTP_PATH: process.env.DATABRICKS_HTTP_PATH,
      DATABRICKS_CLIENT_SECRET: process.env.DATABRICKS_CLIENT_SECRET,
      DATABRICKS_TABLE: process.env.DATABRICKS_TABLE,
    };
    process.env.DATABRICKS_HOST = "mock";
    process.env.DATABRICKS_HTTP_PATH = "mock";
    process.env.DATABRICKS_CLIENT_SECRET = JSON.stringify({
      client_id: "mock",
      client_secret: "mock",
    });
    process.env.DATABRICKS_TABLE = "catalog.schema.addresses";

    let executedQuery = "";
    const client: MinimalDatabricksClient = {
      async connect() {
        return {
          async openSession() {
            return {
              async executeStatement(query) {
                executedQuery = query;
                return {
                  async *iterateRows() {},
                  async close() {},
                };
              },
              async close() {},
            };
          },
        };
      },
      async close() {},
    };

    try {
      const source = createDatabricksSource(() => client);
      await source.rows().next();
      expect(executedQuery).toMatch(/ from `catalog`.`schema`.`addresses` order by uuid asc$/);
      await source.close();
    } finally {
      for (const [key, value] of Object.entries(previousEnvironment)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});
