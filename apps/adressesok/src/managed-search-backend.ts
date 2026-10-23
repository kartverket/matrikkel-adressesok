import type { ElasticsearchSearchBody, SearchBackend } from "./elasticsearch";
import { convertManagedDocument } from "./managed-document";
import type { ManagedElasticsearchClient } from "./managed-elasticsearch";

export function createManagedSearchBackend(
  client: Pick<ManagedElasticsearchClient, "search">,
): SearchBackend {
  return {
    async search(body: ElasticsearchSearchBody) {
      const result = await client.search(
        body as unknown as Parameters<ManagedElasticsearchClient["search"]>[0],
      );
      return {
        total: result.total,
        hits: result.hits.map((hit) => ({
          ...hit,
          _source: convertManagedDocument(hit._source),
        })),
      };
    },
  };
}
