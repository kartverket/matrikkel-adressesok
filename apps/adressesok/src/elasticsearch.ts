import { Client, type estypes } from "@elastic/elasticsearch";
import { HttpConnection } from "@elastic/transport";
import type { ElasticAddressDocument } from "@matrikkel/shared-schema";
import type { Logger } from "pino";
import type { AppConfig } from "./config";

/**
 * Klientgrensesnittet flater ut `query`/`from`/`size`/`sort`/`_source`
 * på toppnivå (ikke pakket inn i `body`), så søkebodyen speiler det.
 */
export type ElasticsearchSearchBody = Pick<
  estypes.SearchRequest,
  "query" | "from" | "size" | "sort" | "_source"
>;

export type ElasticsearchQuery = NonNullable<ElasticsearchSearchBody["query"]>;

export type ElasticsearchHit = {
  _source: ElasticAddressDocument;
  sort?: number[];
};

export type ElasticsearchResult = {
  total: number;
  hits: ElasticsearchHit[];
};

export class ElasticsearchClient {
  private readonly client: Client;

  constructor(
    private readonly config: AppConfig["elasticsearch"],
    private readonly logger: Logger,
  ) {
    this.client = new Client({
      node: config.url,
      Connection: HttpConnection,
      ...(config.apiKey ? { auth: { apiKey: config.apiKey } } : {}),
    });
  }

  async search(body: ElasticsearchSearchBody): Promise<ElasticsearchResult> {
    const response = await this.client.search<ElasticAddressDocument>({
      index: this.config.alias,
      ...body,
    });
    const total =
      typeof response.hits.total === "number"
        ? response.hits.total
        : (response.hits.total?.value ?? 0);
    return { total, hits: response.hits.hits as ElasticsearchHit[] };
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
