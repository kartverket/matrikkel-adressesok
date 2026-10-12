import type { MinimalDatabricksClient } from "./databricks";
import type { DatabricksRow } from "./schema";

const fixtureFilePath = new URL("../dev/fixtures/matrikkel_adresse.json", import.meta.url);

/**
 * Falsk @databricks/sql-klient som leser fixture-rader fra disk i stedet for
 * å spørre et ekte warehouse. Brukes sammen med `createDatabricksSource()`
 * slik at dev/test kjører nøyaktig samme spørrings-, transformasjons- og
 * oppryddingslogikk som i prod - bare med en annen transport under.
 *
 * `connect()`/`host`/`path` osv. kalles og valideres som normalt (se
 * databricks.ts), men ignoreres her; svaret er alltid fixture-dataene.
 */
export function createFakeDatabricksClient(): MinimalDatabricksClient {
  return {
    async connect() {
      return {
        async openSession() {
          return {
            async executeStatement() {
              const rows = (await Bun.file(fixtureFilePath).json()) as DatabricksRow[];
              return {
                iterateRows: async function* () {
                  for (const row of rows) yield row;
                },
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
}
