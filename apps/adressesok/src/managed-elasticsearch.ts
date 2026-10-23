import { Client, type estypes } from "@elastic/elasticsearch9";
import { HttpConnection } from "@elastic/transport";
import type { ElasticAddressDocument } from "@matrikkel/shared-schema";
import type { Logger } from "pino";
import type { AppConfig } from "./config";

export type ManagedElasticsearchQuery = estypes.QueryDslQueryContainer;

/**
 * Søkebody for den nye ES9-klyngen. Det native ES9-klientgrensesnittet
 * flater ut `query`/`from`/`size`/`sort`/`_source` på toppnivå (i
 * motsetning til ES7-klienten, som pakker dem inn i `body`), så denne
 * typen speiler det.
 */
export type ManagedElasticsearchSearchBody = Pick<
  estypes.SearchRequest,
  "query" | "from" | "size" | "sort" | "_source"
>;

export type ManagedSearchHit = {
  _source: ElasticAddressDocument;
  sort?: number[];
};

export type ManagedSearchResult = {
  total: number;
  hits: ManagedSearchHit[];
};

export class ManagedElasticsearchClient {
  private readonly client: Client;

  constructor(
    private readonly config: AppConfig["managedElasticSearch"],
    private readonly logger: Logger,
  ) {
    this.client = new Client({
      node: config.url,
      Connection: HttpConnection,
      ...(config.apiKey ? { auth: { apiKey: config.apiKey } } : {}),
    });
  }

  async search(body: ManagedElasticsearchSearchBody): Promise<ManagedSearchResult> {
    const response = await this.client.search<ElasticAddressDocument>({
      index: this.config.alias,
      ...body,
    });
    const total =
      typeof response.hits.total === "number"
        ? response.hits.total
        : (response.hits.total?.value ?? 0);
    return { total, hits: response.hits.hits as ManagedSearchHit[] };
  }

  async isReady(): Promise<boolean> {
    try {
      await this.client.cluster.health({ local: true });
      return true;
    } catch (err) {
      this.logger.warn({ err }, "Managed Elasticsearch readiness check failed");
      return false;
    }
  }
}
