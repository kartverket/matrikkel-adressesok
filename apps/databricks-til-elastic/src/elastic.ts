import type { estypes } from "@elastic/elasticsearch";
import { Client } from "@elastic/elasticsearch";
import { errors, HttpConnection } from "@elastic/transport";
import { ALIAS, getRequiredEnvVar, NUMBER_OF_REPLICAS } from "./config";
import { MAPPING } from "./schema";

const apiKey = process.env.ES_API_KEY;
export const es = new Client({
  node: getRequiredEnvVar("ES_URL"),
  Connection: HttpConnection,
  ...(apiKey ? { auth: { apiKey } } : {}),
});

export async function indicesWithAlias(): Promise<string[]> {
  try {
    const alias = await es.indices.getAlias({ name: ALIAS });
    return Object.keys(alias);
  } catch (error) {
    if (error instanceof errors.ResponseError && error.meta.statusCode === 404) return [];
    throw error;
  }
}

export function createIndex(index: string): Promise<estypes.IndicesCreateResponse> {
  return es.indices.create({ index, ...MAPPING });
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
