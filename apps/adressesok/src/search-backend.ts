import type { AddressDocument } from "@matrikkel/shared-schema";
import { convertElasticDocument } from "./elastic-document";
import type { ElasticsearchClient, ElasticsearchSearchBody } from "./elasticsearch";

export type SearchHit = {
  _source: AddressDocument;
  sort?: number[];
};

export type SearchResult = {
  total: number;
  hits: SearchHit[];
};

export interface SearchBackend {
  search(body: ElasticsearchSearchBody): Promise<SearchResult>;
}

export function createSearchBackend(client: Pick<ElasticsearchClient, "search">): SearchBackend {
  return {
    async search(body: ElasticsearchSearchBody) {
      const result = await client.search(body);
      return {
        total: result.total,
        hits: result.hits.map((hit) => ({
          ...hit,
          _source: convertElasticDocument(hit._source),
        })),
      };
    },
  };
}
