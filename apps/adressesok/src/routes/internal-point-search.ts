import type { Hono } from "hono";
import type { Logger } from "pino";
import type { Registry } from "prom-client";
import type { AddressDocument } from "../elasticsearch";
import { jsonResponse } from "../http";
import { convertManagedDocument } from "../managed-document";
import type { ManagedElasticsearchClient, ManagedSearchHit } from "../managed-elasticsearch";
import { reprojectAddresses, reprojectInputToDefault } from "../projection";
import { createHistogram, measureTime } from "../utils/metrics";
import { validateQuery } from "../utils/query-validation";
import {
  type AddressListOutput,
  filterGeoAddressOutput,
  metadata,
  rawQuery,
  serializeGeoAddress,
} from "../utils/response";
import { GeoPointSchema, geoPointSearchBody } from "./point-search";

function addressWithDistance(hit: ManagedSearchHit): AddressDocument {
  const document = convertManagedDocument(hit._source);
  const distance = hit.sort?.[0];
  if (distance === undefined) return document;

  return { ...document, meterDistanseTilPunkt: distance };
}

/**
 * Speiler `/punktsok` (`routes/point-search.ts`), men søker mot den nye
 * ES9-klyngen. Feltet `representasjonspunkt` heter det samme i begge
 * skjema, så geo-spørringen (`geoPointSearchBody`) gjenbrukes direkte -
 * kun dokumentkonverteringen (`convertManagedDocument`) er forskjellig.
 */
export function registerInternalPointSearchRoute(
  app: Hono,
  managedElasticsearch: Pick<ManagedElasticsearchClient, "search">,
  logger: Logger,
  prometheus: Registry,
): void {
  const timeHistogram = createHistogram({
    name: "internal_punktsok_managed_query_duration_seconds",
    help: "Time used to execute punktsok queries against the managed (ES9) Elasticsearch cluster",
    registers: [prometheus],
  });
  app.get("/internal/punktsok", validateQuery(GeoPointSchema), async (context) => {
    const parameters = context.req.valid("query");
    const point = reprojectInputToDefault(parameters.lat, parameters.lon, parameters.koordsys);
    const body = geoPointSearchBody(
      point.lat,
      point.lon,
      parameters.radius,
      parameters.side * parameters.treffPerSide,
      parameters.treffPerSide,
    );
    logger.debug({ query: body.query }, "Managed Elasticsearch geo query");
    // Bodyen er typet med ES7-klientens DSL, mens managed-klienten er ES9.
    // DSL-en sendes som JSON, men de genererte TypeScript-typene er ulike.
    const result = await measureTime(timeHistogram, () =>
      managedElasticsearch.search(
        body as unknown as Parameters<ManagedElasticsearchClient["search"]>[0],
      ),
    );
    const addresses = result.hits.map(addressWithDistance);
    const output: AddressListOutput = {
      metadata: metadata(
        parameters.treffPerSide,
        parameters.side,
        result.total,
        rawQuery(context.req.url),
      ),
      adresser: reprojectAddresses(addresses, parameters.utkoordsys).map(serializeGeoAddress),
    };
    return jsonResponse(
      filterGeoAddressOutput(output, parameters.filtrer),
      200,
      parameters.asciiKompatibel,
    );
  });
}
