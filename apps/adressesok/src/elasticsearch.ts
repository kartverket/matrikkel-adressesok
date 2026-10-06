import { Client, type ClientOptions, type estypes } from "@elastic/elasticsearch";
import type { AddressDocument } from "@matrikkel/shared-schema";
import type { Logger } from "pino";
import type { AppConfig } from "./config";

export type { AddressDocument };

export type ElasticsearchQuery = estypes.QueryDslQueryContainer;
export type ElasticsearchSearchBody = NonNullable<estypes.SearchRequest["body"]>;

export type SearchHit = {
  _source: AddressDocument;
  sort?: number[];
};

export type SearchResult = {
  total: number;
  hits: SearchHit[];
};

type ElasticsearchSearchResponse = {
  hits: {
    total: number | { value: number; relation: string };
    hits: SearchResult["hits"];
  };
};

export interface Elasticsearch {
  search(body: ElasticsearchSearchBody): Promise<SearchResult>;

  isReady(): Promise<boolean>;
}

export class ElasticsearchClient implements Elasticsearch {
  private readonly client: Client;

  constructor(
    private readonly config: AppConfig,
    private readonly logger: Logger,
  ) {
    const options: ClientOptions = {
      node: config.elasticSearch.url,
      requestTimeout: config.elasticSearch.requestTimeout,
    };
    if (config.elasticSearch.username && config.elasticSearch.password) {
      options.auth = {
        username: config.elasticSearch.username,
        password: config.elasticSearch.password,
      };
    }
    this.client = new Client(options);
  }

  async search(body: ElasticsearchSearchBody): Promise<SearchResult> {
    const response = await this.client.search<ElasticsearchSearchResponse>({
      index: this.config.elasticSearch.index,
      body,
    });
    const total =
      typeof response.body.hits.total === "number"
        ? response.body.hits.total
        : response.body.hits.total.value;
    return { total, hits: response.body.hits.hits };
  }

  async isReady(): Promise<boolean> {
    try {
      await this.client.cluster.health({ local: true });
      return true;
    } catch (err) {
      this.logger.warn({ err }, "Elasticsearch readiness check failed");
      return false;
    }
  }
}
