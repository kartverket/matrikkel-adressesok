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

const logger = pino({ enabled: false });
/**
 * Tar imot en mock med den gamle ES7-formen (AddressDocument) og gjør den om til
 * den nye indeksens dokumentform, slik at testene kan beskrive treff på én måte.
 */
function appWithLegacyShapedMock(elasticsearch: Elasticsearch, appLogger = logger) {
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
    managedElasticsearch: managedSearch,
    logger: appLogger,
    registry: new Registry(),
  });
}

export function appWith(elasticsearch: Elasticsearch) {
  return appWithLegacyShapedMock(elasticsearch);
}

function toManagedDocument(address: AddressDocument): Record<string, unknown> {
  return {
    uuid: "test-address",
    adresse_id: "test-address",
    adressetype: address.objtype,
    oppdateringsdato: address.oppdateringsdato ?? "2022-01-27T19:50:50.000Z",
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
    undernummer: address.undernummer ?? null,
    representasjonspunkt: address.representasjonspunkt,
    representasjonspunkt_stedfesting_verifisert: address.stedfestingverifisert,
    atkomstpunkt: { sommer: null, vinter: null, generell: null },
    "@version": "test",
    "@timestamp": "2022-01-27T19:50:50.000Z",
  };
}

/**
 * Som appWith, men fanger opp alt som logges slik at tester kan verifisere
 * hvilket nivå (info/warn/error) faktiske request/response-logger havner på.
 */
export function appWithCapturedLogs(elasticsearch: Elasticsearch) {
  const entries: Record<string, unknown>[] = [];
  const capturingLogger = pino(
    {
      level: "info",
      messageKey: "message",
      formatters: { level: (label: string) => ({ level: label.toUpperCase() }) },
    },
    { write: (line: string) => entries.push(JSON.parse(line)) },
  );
  const app = appWithLegacyShapedMock(elasticsearch, capturingLogger);
  return { app, entries };
}
