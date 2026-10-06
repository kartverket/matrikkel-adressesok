import type { estypes } from "@elastic/elasticsearch";
import { Client } from "@elastic/elasticsearch";
import { HttpConnection } from "@elastic/transport";
import { ALIAS, getRequiredEnvVar, INDEX_PREFIX, NUMBER_OF_REPLICAS } from "./config";
import { logger } from "./logger";
import { type AddressDocument, MAPPING } from "./schema";

const apiKey = process.env.ES_API_KEY;
export const es = new Client({
  node: getRequiredEnvVar("ES_URL"),
  Connection: HttpConnection,
  ...(apiKey ? { auth: { apiKey } } : {}),
});

export function newIndexName(now: Date): string {
  return `${INDEX_PREFIX}-${now.toISOString().replace(/\D/g, "").slice(0, 14)}`;
}

export async function indicesWithAlias(): Promise<string[]> {
  const alias = await es.indices.getAlias({ name: ALIAS }, { ignore: [404] });
  return Object.keys(alias).filter((i) => i.startsWith(INDEX_PREFIX));
}

export function createIndex(index: string): Promise<estypes.IndicesCreateResponse> {
  return es.indices.create({ index, ...MAPPING });
}

export function loadDocumentStream(index: string, docs: AsyncIterator<AddressDocument>) {
  return es.helpers.bulk({
    datasource: docs,
    onDocument: (doc) => ({ index: { _index: index, _id: doc.lokalid } }),
    onDrop: (doc) =>
      logger.error({ lokalid: doc.document.lokalid, reason: doc.error?.reason }, "dokument avvist"),
  });
}

export async function makeIndexSearchable(index: string): Promise<void> {
  await es.indices.putSettings({
    index,
    settings: { refresh_interval: "1s", number_of_replicas: NUMBER_OF_REPLICAS },
  });
  await es.indices.refresh({ index });
}

export async function docCount(index: string | string[]): Promise<number> {
  const { count } = await es.count({ index });
  return count;
}

export async function swapAliasAtomically(
  index: string,
  indicesToLoseAlias: string[],
): Promise<void> {
  await es.indices.updateAliases({
    actions: [
      ...indicesToLoseAlias.map((i) => ({ remove: { index: i, alias: ALIAS } })),
      { add: { index, alias: ALIAS } },
    ],
  });
}

export async function deleteIndices(indices: string[]): Promise<void> {
  if (indices.length === 0) return;
  await es.indices.delete({ index: indices }, { ignore: [404] });
}
