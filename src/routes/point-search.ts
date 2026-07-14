import type { Hono } from "hono";
import type { Logger } from "pino";
import { z } from "zod";
import type {
  AddressDocument,
  Elasticsearch,
  ElasticsearchSearchBody,
  SearchHit,
} from "../elasticsearch";
import { jsonResponse } from "../http";
import { DEFAULT_SRID, reprojectAddresses, reprojectInputToDefault } from "../projection";
import {
  enforcePaginationLimit,
  integerQuery,
  numberQuery,
  standardParameters,
  validateQuery,
} from "../utils/query-validation";
import {
  type AddressListOutput,
  filterGeoAddressOutput,
  metadata,
  rawQuery,
  serializeGeoAddress,
} from "../utils/response";

export const GeoPointSchema = z
  .strictObject({
    lat: numberQuery,
    lon: numberQuery,
    radius: integerQuery,
    koordsys: integerQuery.optional().default(DEFAULT_SRID),
    ...standardParameters,
  })
  .superRefine(enforcePaginationLimit);

export function geoPointSearchBody(
  lat: number,
  lon: number,
  radius: number,
  from: number,
  size: number,
): ElasticsearchSearchBody {
  return {
    query: {
      bool: {
        must: [{ query_string: { query: "*" } }],
        filter: [
          {
            geo_distance: {
              distance: `${radius}m`,
              representasjonspunkt: { lat, lon },
            },
          },
        ],
      },
    },
    from,
    size,
    _source: { excludes: ["objid"] },
    sort: [
      {
        _geo_distance: {
          representasjonspunkt: { lat, lon },
          order: "asc",
          unit: "m",
          distance_type: "arc",
        },
      },
    ],
  };
}

function addressWithDistance(hit: SearchHit): AddressDocument {
  const distance = hit.sort?.[0];
  if (distance === undefined) return hit._source;

  return {
    ...hit._source,
    meterDistanseTilPunkt: distance,
  };
}

export function registerPointSearchRoute(
  app: Hono,
  elasticsearch: Elasticsearch,
  logger: Logger,
): void {
  app.get("/punktsok", validateQuery(GeoPointSchema), async (context) => {
    const parameters = context.req.valid("query");
    const point = reprojectInputToDefault(parameters.lat, parameters.lon, parameters.koordsys);
    const body = geoPointSearchBody(
      point.lat,
      point.lon,
      parameters.radius,
      parameters.side * parameters.treffPerSide,
      parameters.treffPerSide,
    );
    logger.debug({ query: body.query }, "Elasticsearch geo query");
    const result = await elasticsearch.search(body);
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
