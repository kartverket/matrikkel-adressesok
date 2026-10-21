import { Client } from "@elastic/elasticsearch9";
import { HttpConnection } from "@elastic/transport";
import type { ElasticAddressDocument } from "@matrikkel/shared-schema";
import type { Logger } from "pino";
import type { AppConfig } from "./config";

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

  async dummySearch(): Promise<ElasticAddressDocument | undefined> {
    const response = await this.client.search<ElasticAddressDocument>({
      index: this.config.alias,
      query: { match_all: {} },
      size: 1,
    });
    const hit = response.hits.hits[0];
    if (hit && !hit._source) throw new Error("Elasticsearch search hit is missing _source");
    return hit?._source;
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
