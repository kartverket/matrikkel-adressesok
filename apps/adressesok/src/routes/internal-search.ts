import type { ElasticsearchQuery } from "../elasticsearch";
import { badRequest } from "../http";
import { addressParameters, type GeneralSearchParameters } from "./search";

/**
 * Query-builderen er bevisst duplisert fra dagens `/sok`: det nye indeks-
 * skjemaet har egne feltaliaser, og endringer her skal ikke endre legacy-
 * søkeflyten.
 */
type AddressParameterName = keyof typeof addressParameters;
const addressParameterNames = Object.keys(addressParameters) as AddressParameterName[];
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

function createManagedAddressQueries(parameters: GeneralSearchParameters): ElasticsearchQuery[] {
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

export function constructManagedQuery(parameters: GeneralSearchParameters): ElasticsearchQuery {
  const queries = createManagedAddressQueries(parameters);
  const generalSearchQuery = createManagedGeneralSearchQuery(parameters);
  if (generalSearchQuery) queries.unshift(generalSearchQuery);

  const [firstQuery, ...additionalQueries] = queries;
  if (!firstQuery) badRequest("Ingen søkeparametere oppgitt.");
  return additionalQueries.length === 0 ? firstQuery : { bool: { must: queries } };
}
