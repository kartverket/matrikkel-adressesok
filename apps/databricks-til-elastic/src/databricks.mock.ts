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
            async executeStatement(query: string) {
              const rows = await mockRows();
              if (query.startsWith("select count(*)")) {
                return {
                  iterateRows: async function* () {
                    yield { total: rows.length };
                  },
                  async close() {},
                };
              }

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

async function mockRows(): Promise<DatabricksRow[]> {
  const examples = (await Bun.file(fixtureFilePath).json()) as DatabricksRow[];
  if (examples.length === 0) throw new Error("Databricks-fixturen er tom");
  return Array.from({ length: 100 }, (_, index) => {
    const example = examples[index % examples.length];
    if (!example) throw new Error("Databricks-fixturen er tom");
    return mockRow(example, index);
  });
}

function mockRow(example: DatabricksRow, index: number): DatabricksRow {
  const id = 2000001 + index;
  return {
    ...example,
    uuid: String(id),
    adresse_id: id,
    adressetekst: `${example.adressetekst} (${index + 1})`,
    adressetekstutenadressetilleggsnavn: `${example.adressetekstutenadressetilleggsnavn} (${index + 1})`,
    nummer: example.nummer === null ? null : index + 1,
    bruksnummer: index + 1,
  };
}
