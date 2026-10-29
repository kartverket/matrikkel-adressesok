import type { Hono } from "hono";
import type { Logger } from "pino";
import type { Registry } from "prom-client";
import { jsonResponse } from "../http";
import { reprojectAddresses } from "../projection";
import type { SearchBackend } from "../search-backend";
import { createHistogram, measureTime } from "../utils/metrics";
import { validateQuery } from "../utils/query-validation";
import {
  type AddressListOutput,
  filterAddressOutput,
  metadata,
  rawQuery,
  serializeAddress,
} from "../utils/response";
import { GeneralSearchSchema } from "./search-parameters";
import { constructQuery } from "./search-query";

function sanitizeRawQuery(query: string): string {
  return query.replaceAll("\\", " ").replaceAll("~", "").replaceAll("/", " ").replaceAll("%22", "");
}

export function registerSearchRoute(
  app: Hono,
  searchBackend: SearchBackend,
  logger: Logger,
  prometheus: Registry,
): void {
  const timeHistogram = createHistogram({
    name: "sok_query_duration_seconds",
    help: "Time used to execute sok queries",
    registers: [prometheus],
  });
  app.get("/sok", validateQuery(GeneralSearchSchema), async (context) => {
    const parameters = context.req.valid("query");
    const query = constructQuery(parameters);
    logger.debug({ query }, "Elasticsearch query");
    const result = await measureTime(timeHistogram, () =>
      searchBackend.search({
        query,
        from: parameters.side * parameters.treffPerSide,
        size: parameters.treffPerSide,
        _source: { excludes: ["objid"] },
      }),
    );

    const addresses = reprojectAddresses(
      result.hits.map((hit) => hit._source),
      parameters.utkoordsys,
    );
    const output: AddressListOutput = {
      metadata: metadata(
        parameters.treffPerSide,
        parameters.side,
        result.total,
        sanitizeRawQuery(rawQuery(context.req.url)),
      ),
      adresser: addresses.map(serializeAddress),
    };
    return jsonResponse(
      filterAddressOutput(output, parameters.filtrer),
      200,
      parameters.asciiKompatibel,
    );
  });
}
