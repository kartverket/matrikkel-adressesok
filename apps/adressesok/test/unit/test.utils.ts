import pino from "pino";
import { Registry } from "prom-client";
import { createApp } from "../../src/app";
import type {
  AddressDocument,
  Elasticsearch,
  ElasticsearchSearchBody,
} from "../../src/elasticsearch";
import type {
  ManagedElasticsearchSearchBody,
  ManagedSearchResult,
} from "../../src/managed-elasticsearch";

export type SearchImplementation = "legacy" | "managed";

const logger = pino({ enabled: false });
const managedElasticsearch = {
  isReady: async () => true,
  search: async () => ({ total: 0, hits: [] }),
};

export function appWith(elasticsearch: Elasticsearch) {
  return createApp({ elasticsearch, managedElasticsearch, logger, registry: new Registry() });
}

function appWithImplementation(
  elasticsearch: Elasticsearch,
  implementation: SearchImplementation,
  appLogger = logger,
) {
  if (implementation === "legacy") {
    return createApp({
      elasticsearch,
      managedElasticsearch,
      logger: appLogger,
      registry: new Registry(),
    });
  }

  const managedSearch = {
    isReady: elasticsearch.isReady,
    search: async (body: ManagedElasticsearchSearchBody) => {
      const result = await elasticsearch.search({
        query: (body.query ?? { match_all: {} }) as unknown as NonNullable<
          ElasticsearchSearchBody["query"]
        >,
        from: body.from ?? 0,
        size: body.size ?? 10,
      });
      return {
        total: result.total,
        hits: result.hits.map((hit) => ({
          ...hit,
          _source: toManagedDocument(hit._source),
        })),
      } as unknown as ManagedSearchResult;
    },
  };

  return createApp({
    elasticsearch: { isReady: async () => true, search: async () => ({ total: 0, hits: [] }) },
    managedElasticsearch: managedSearch,
    logger: appLogger,
    registry: new Registry(),
  });
}

function toManagedDocument(address: AddressDocument): Record<string, unknown> {
  return {
    uuid: "test-address",
    adresse_id: "test-address",
    adressetype: address.objtype,
    oppdateringsdato: address.oppdateringsdato,
    adressetekst: address.adressetekst,
    adressetekstutenadressetilleggsnavn: address.adressetekstutenadressetilleggsnavn,
    adressenavn: address.adressenavn,
    adressetilleggsnavn: address.adressetilleggsnavn,
    kortnavn: null,
    adressekode: address.adressekode == null ? address.adressekode : String(address.adressekode),
    nummer: address.nummer,
    bokstav: address.bokstav,
    bruksenhetsnummer: address.bruksenhetsnummer ?? [],
    kommunenavn: address.kommunenavn,
    kommunenummer: address.adresse_kommunenummer ?? address.kommunenummer,
    postnummer: address.postnummer,
    poststed: address.poststed,
    gardsnummer: address.gardsnummer,
    bruksnummer: address.bruksnummer,
    festenummer: address.festenummer,
    seksjonsnummer: 0,
    representasjonspunkt: address.representasjonspunkt,
    representasjonspunkt_stedfesting_verifisert: address.stedfestingverifisert,
    atkomstpunkt: { sommer: null, vinter: null, generell: null },
    "@version": "test",
    "@timestamp": "2022-01-27T19:50:50.000Z",
  };
}

export function appWithSearchImplementation(
  elasticsearch: Elasticsearch,
  implementation: SearchImplementation,
) {
  return appWithImplementation(elasticsearch, implementation);
}

/**
 * Som appWith, men fanger opp alt som logges slik at tester kan verifisere
 * hvilket nivå (info/warn/error) faktiske request/response-logger havner på.
 */
export function appWithCapturedLogs(
  elasticsearch: Elasticsearch,
  implementation: SearchImplementation = "legacy",
) {
  const entries: Record<string, unknown>[] = [];
  const capturingLogger = pino(
    {
      level: "info",
      messageKey: "message",
      formatters: { level: (label: string) => ({ level: label.toUpperCase() }) },
    },
    { write: (line: string) => entries.push(JSON.parse(line)) },
  );
  const app = appWithImplementation(elasticsearch, implementation, capturingLogger);
  return { app, entries };
}
