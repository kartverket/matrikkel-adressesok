import type { Hono } from "hono";
import type { Logger } from "pino";
import type { Registry } from "prom-client";
import type { z } from "zod";
import type { ElasticsearchQuery } from "../elasticsearch";
import { badRequest, jsonResponse } from "../http";
import { convertManagedDocument } from "../managed-document";
import type { ManagedElasticsearchClient } from "../managed-elasticsearch";
import { reprojectAddresses } from "../projection";
import { createHistogram, measureTime } from "../utils/metrics";
import { validateQuery } from "../utils/query-validation";
import {
  type AddressListOutput,
  filterAddressOutput,
  metadata,
  rawQuery,
  serializeAddress,
} from "../utils/response";
import { GeneralSearchSchema } from "./search";

/**
 * Query-builderen er bevisst duplisert fra dagens `/sok`: det nye indeks-
 * skjemaet har egne feltaliaser, og endringer her skal ikke endre legacy-
 * søkeflyten.
 */
type ManagedSearchParameters = z.output<typeof GeneralSearchSchema>;
type AddressParameterName =
  | "adressenavn"
  | "adressetekst"
  | "adressetilleggsnavn"
  | "adressekode"
  | "nummer"
  | "bokstav"
  | "kommunenummer"
  | "kommunenavn"
  | "gardsnummer"
  | "bruksnummer"
  | "festenummer"
  | "undernummer"
  | "bruksenhetsnummer"
  | "objtype"
  | "poststed"
  | "postnummer";

const addressParameterNames: AddressParameterName[] = [
  "adressenavn",
  "adressetekst",
  "adressetilleggsnavn",
  "adressekode",
  "nummer",
  "bokstav",
  "kommunenummer",
  "kommunenavn",
  "gardsnummer",
  "bruksnummer",
  "festenummer",
  "undernummer",
  "bruksenhetsnummer",
  "objtype",
  "poststed",
  "postnummer",
];
const textFields = new Set([
  "kommunenavn",
  "kommunenummer",
  "adressetekst",
  "poststed",
  "adressenavn",
  "postnummer",
]);
const exactPhraseFields = new Set(["adressetekst", "adressenavn"]);
const fieldAliases: Partial<Record<AddressParameterName, string>> = {
  objtype: "adressetype",
};

function replaceIllegalCharacters(value: string): string {
  return value
    .replace(/[\\/:!(){}[\]^?+]/g, " ")
    .replace(/&&|\|\|/g, " ")
    .replace(/"/g, "")
    .replace(/~/g, "")
    .trim();
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
  if (key === "bokstav") return { match: { [key]: String(rawValue).toUpperCase() } };
  return { match: { [key]: rawValue } };
}

function applyFuzziness(term: string, fuzzy: boolean): string {
  if (!fuzzy || /^[+-]?\d+$/.test(term)) return term;
  return `${term}~`;
}

function createManagedAddressQueries(parameters: ManagedSearchParameters): ElasticsearchQuery[] {
  const queries: ElasticsearchQuery[] = [];
  for (const key of addressParameterNames) {
    const value = parameters[key];
    if (value === undefined) continue;
    if (key === "undernummer") badRequest("Søkeparameteret undernummer støttes ikke.");
    queries.push(queryForField(fieldAliases[key] ?? key, value));
  }
  return queries;
}

function createManagedGeneralSearchQuery(
  parameters: ManagedSearchParameters,
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
  const generalSearch = searchTerms.map((term) => applyFuzziness(term, parameters.fuzzy)).join(" ");
  if (!generalSearch) return undefined;

  return {
    simple_query_string: {
      query: generalSearch,
      default_operator: operator,
      fuzzy_max_expansions: 100,
    },
  };
}

function constructManagedQuery(parameters: ManagedSearchParameters): ElasticsearchQuery {
  const queries = createManagedAddressQueries(parameters);
  const generalSearchQuery = createManagedGeneralSearchQuery(parameters);
  if (generalSearchQuery) queries.unshift(generalSearchQuery);

  const [firstQuery, ...additionalQueries] = queries;
  if (!firstQuery) badRequest("Ingen søkeparametere oppgitt.");
  return additionalQueries.length === 0 ? firstQuery : { bool: { must: queries } };
}

function sanitizeRawQuery(query: string): string {
  return query.replaceAll("\\", " ").replaceAll("~", "").replaceAll("/", " ").replaceAll("%22", "");
}

/**
 * Speiler `/sok` (`routes/search.ts`), men søker mot den nye ES9-klyngen
 * via `ManagedElasticsearchClient`. Query-byggingen er separat fordi
 * ES9-indeksen bruker andre felt enn legacy-indeksen.
 */
export function registerInternalSearchRoute(
  app: Hono,
  managedElasticsearch: Pick<ManagedElasticsearchClient, "search">,
  logger: Logger,
  prometheus: Registry,
): void {
  const timeHistogram = createHistogram({
    name: "internal_sok_managed_query_duration_seconds",
    help: "Time used to execute sok queries against the managed (ES9) Elasticsearch cluster",
    registers: [prometheus],
  });
  app.get("/internal/sok", validateQuery(GeneralSearchSchema), async (context) => {
    const parameters = context.req.valid("query");
    const query = constructManagedQuery(parameters);
    logger.debug({ query }, "Managed Elasticsearch query");
    const result = await measureTime(timeHistogram, () =>
      // Queryen er typet med ES7-klientens DSL, mens managed-klienten er ES9.
      // DSL-en sendes som JSON, men de genererte TypeScript-typene er ulike.
      managedElasticsearch.search({
        query,
        from: parameters.side * parameters.treffPerSide,
        size: parameters.treffPerSide,
      } as unknown as Parameters<ManagedElasticsearchClient["search"]>[0]),
    );

    const addresses = reprojectAddresses(
      result.hits.map((hit) => convertManagedDocument(hit._source)),
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
