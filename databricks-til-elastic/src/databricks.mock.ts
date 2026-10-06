import { logger } from "./logger";
import type { AddressDocument, DatabricksRow } from "./schema";
import { rowToDocument } from "./transform";

const fixtureFilePath = new URL("../dev/fixtures/matrikkel_adresse.json", import.meta.url);

export async function* documents(timestamp: string): AsyncGenerator<AddressDocument> {
  const rows = (await Bun.file(fixtureFilePath).json()) as DatabricksRow[];

  let count = 0;
  for (const row of rows) {
    const doc = rowToDocument(row, timestamp);
    if (doc) yield doc;
    else logger.warn({ source: "mock" }, "rad uten lokalid, hoppet over");
    count++;
  }
  logger.info({ rows: count, fixture: fixtureFilePath.pathname }, "mock-fixture lest");
}

export async function close(): Promise<void> {}
