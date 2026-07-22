import type { Hono } from "hono";
import type { Logger } from "pino";
import type { Registry } from "prom-client";
import { z } from "zod";
import type { Elasticsearch, ElasticsearchQuery } from "../elasticsearch";
import { badRequest, jsonResponse } from "../http";
import { reprojectAddresses } from "../projection";
import { createHistogram, measureTime } from "../utils/metrics";
import {
  booleanQuery,
  enforcePaginationLimit,
  integerQuery,
  standardParameters,
  validateQuery,
} from "../utils/query-validation";
import {
  type AddressListOutput,
  filterAddressOutput,
  metadata,
  rawQuery,
  serializeAddress,
} from "../utils/response";

const addressParameters = {
  adressenavn: z.string().optional(),
  adressetekst: z.string().optional(),
  adressetilleggsnavn: z.string().optional(),
  adressekode: integerQuery.optional(),
  nummer: integerQuery.optional(),
  bokstav: z.string().optional(),
  kommunenummer: z.string().optional(),
  kommunenavn: z.string().optional(),
  gardsnummer: integerQuery.optional(),
  bruksnummer: integerQuery.optional(),
  festenummer: integerQuery.optional(),
  undernummer: integerQuery.optional(),
  bruksenhetsnummer: z.string().optional(),
  objtype: z
    .enum(["Matrikkeladresse", "Vegadresse"], {
      error: "Feil i søkeparameter. Gyldige verdier er: ('Matrikkeladresse', 'Vegadresse')",
    })
    .optional(),
  poststed: z.string().optional(),
  postnummer: z.string().optional(),
};

export const GeneralSearchSchema = z
  .strictObject({
    sok: z.string().optional(),
    fuzzy: booleanQuery.optional().default(false),
    sokemodus: z
      .string()
      .toUpperCase()
      .pipe(
        z.enum(["AND", "OR"], {
          error: "Feil i søkeparameter. Gyldige verdier er: ('AND', 'OR')",
        }),
      )
      .optional(),
    ...addressParameters,
    ...standardParameters,
  })
  .superRefine(enforcePaginationLimit);

type GeneralSearchParameters = z.output<typeof GeneralSearchSchema>;
type AddressParameterName = keyof typeof addressParameters;
const addressParameterNames = Object.keys(addressParameters) as AddressParameterName[];
const textFields = new Set([
  "kommunenavn",
  "adresse_kommunenummer",
  "adressetekst",
  "poststed",
  "adressenavn",
  "postnummer",
]);
const exactPhraseFields = new Set(["adressetekst", "adressenavn"]);
const elasticsearchFieldAliases: Partial<Record<AddressParameterName, string>> = {
  kommunenummer: "adresse_kommunenummer",
};

function replaceIllegalCharacters(value: string): string {
  return value.replace(/[\\/]/g, " ").replace(/"/g, "").replace(/~/g, "").trim();
}

function queryForField(key: string, rawValue: string | number): ElasticsearchQuery {
  if (textFields.has(key)) {
    const value = replaceIllegalCharacters(String(rawValue));
    if (value.includes("*")) {
      return {
        match_phrase_prefix: {
          [key]: { query: value.replace(/\*/g, ""), max_expansions: 500 },
        },
      };
    }
    if (exactPhraseFields.has(key)) {
      return { match_phrase: { [key]: value } };
    }
    return { match: { [key]: value } };
  }

  if (typeof rawValue !== "number" && String(rawValue).includes("*")) {
    badRequest(`Wildcard er ikke støttet for parameteret ${key}.`);
  }

  if (key === "bokstav") {
    return { match: { [key]: String(rawValue).toUpperCase() } };
  }
  return { match: { [key]: rawValue } };
}

function applyFuzziness(term: string, fuzzy: boolean): string {
  if (!fuzzy) return term;
  if (/^[+-]?\d+$/.test(term)) return term;
  return `${term}~`;
}

function sanitizeRawQuery(query: string): string {
  return query.replaceAll("\\", " ").replaceAll("~", "").replaceAll("/", " ").replaceAll("%22", "");
}

function createGeneralSearchQuery(
  parameters: GeneralSearchParameters,
): ElasticsearchQuery | undefined {
  const operator = parameters.sokemodus ?? "AND";
  const searchTerms = replaceIllegalCharacters(parameters.sok ?? "")
    .replace(/-/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const fuzzyWildcard = searchTerms.some((term) => term.includes("*"));
  if (parameters.fuzzy && fuzzyWildcard) {
    badRequest("Wildcard kan ikke brukes med fuzzysøk.");
  }
  const generalSearch = searchTerms
    .map((term) => applyFuzziness(term, parameters.fuzzy))
    .join(` ${operator} `);
  if (!generalSearch) return;

  return {
    query_string: {
      query: generalSearch,
      default_operator: operator,
      fuzzy_max_expansions: 100,
      type: "cross_fields",
    },
  };
}

function createAddressQueries(parameters: GeneralSearchParameters): ElasticsearchQuery[] {
  const queries: ElasticsearchQuery[] = [];
  for (const key of addressParameterNames) {
    const value = parameters[key];
    if (value === undefined) continue;
    const elasticsearchField = elasticsearchFieldAliases[key] ?? key;
    queries.push(queryForField(elasticsearchField, value));
  }
  return queries;
}

function combineQueries(queries: ElasticsearchQuery[]): ElasticsearchQuery {
  const [firstQuery, ...additionalQueries] = queries;
  if (!firstQuery) badRequest("Ingen søkeparametere oppgitt.");
  if (additionalQueries.length === 0) return firstQuery;

  return { bool: { must: [firstQuery, ...additionalQueries] } };
}

export function constructGeneralQuery(parameters: GeneralSearchParameters): ElasticsearchQuery {
  const queries = createAddressQueries(parameters);
  const generalSearchQuery = createGeneralSearchQuery(parameters);
  if (generalSearchQuery) queries.unshift(generalSearchQuery);
  return combineQueries(queries);
}

export function registerSearchRoute(
  app: Hono,
  elasticsearch: Elasticsearch,
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
    const query = constructGeneralQuery(parameters);
    logger.debug({ query }, "Elasticsearch query");
    const result = await measureTime(timeHistogram, () =>
      elasticsearch.search({
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
