import type { AddressDocument } from "@matrikkel/shared-schema";
import pino from "pino";
import { Registry } from "prom-client";
import { createApp } from "../../src/app";
import type { ElasticsearchResult, ElasticsearchSearchBody } from "../../src/elasticsearch";
import type { SearchBackend } from "../../src/search-backend";

type SearchStub = SearchBackend & { isReady(): Promise<boolean> };

const logger = pino({ enabled: false });

/** Lager appen med en stub som svarer med API-dokumenter, oversatt til indeksformatet. */
export function appWith(stub: SearchStub, appLogger = logger) {
  const elasticsearch = {
    isReady: stub.isReady,
    search: async (body: ElasticsearchSearchBody) => {
      const result = await stub.search(body);
      return {
        total: result.total,
        hits: result.hits.map((hit) => ({
          ...hit,
          _source: toElasticDocument(hit._source),
        })),
      } as unknown as ElasticsearchResult;
    },
  };

  return createApp({ elasticsearch, logger: appLogger, registry: new Registry() });
}

function toElasticDocument(address: AddressDocument): Record<string, unknown> {
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
    atkomstpunkt: {
      oy: null,
      nodetat: null,
      sommer: null,
      vinter: null,
      generell: null,
    },
    "@version": "test",
    "@timestamp": "2022-01-27T19:50:50.000Z",
  };
}

/**
 * Som appWith, men fanger opp alt som logges slik at tester kan verifisere
 * hvilket nivå (info/warn/error) faktiske request/response-logger havner på.
 */
export function appWithCapturedLogs(stub: SearchStub) {
  const entries: Record<string, unknown>[] = [];
  const capturingLogger = pino(
    {
      level: "info",
      messageKey: "message",
      formatters: { level: (label: string) => ({ level: label.toUpperCase() }) },
    },
    { write: (line: string) => entries.push(JSON.parse(line)) },
  );
  const app = appWith(stub, capturingLogger);
  return { app, entries };
}
