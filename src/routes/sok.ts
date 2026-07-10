import {Handler} from "hono";
import {parseSearchParams, splitStandardParams} from "../utils/validation";
import {Client} from "@elastic/elasticsearch";
import {reprojectAddresses} from "../utils/projection";
import {Address, toAddresses} from "../types/address";
import {buildResponse, getTotalHits} from "../types/searchResponse";
import type { estypes } from "@elastic/elasticsearch";
import {badRequest} from "../error-handlings";

type Config = {
    esClient: Client;
    index: string;
};

const textFields = new Set([
    "kommunenavn",
    "adresse_kommunenummer",
    "adressetekst",
    "poststed",
    "adressenavn",
    "kommunenummer",
    "postnummer"
]);

export function sokHandlerFactory(config: Config): Handler {
    return async (c, next) => {
        const url = new URL(c.req.url);
        const params = parseSearchParams(url);
        const {standard, searchParams} = splitStandardParams(params);
        const from = standard.side * standard.treffPerSide;
        const query = buildAddressQuery(searchParams);

        const result = await config.esClient.search<Address>({
            index: config.index,
            from,
            size: standard.treffPerSide,
            query,
            _source_excludes: ["objid"]
        });

        const addresses = reprojectAddresses(toAddresses(result.hits.hits), standard.utkoordsys);
        const response = buildResponse(standard, getTotalHits(result.hits.total), addresses, sanitizeSearchString(url));
        return c.json(response);
    }
}

function buildAddressQuery(input: Record<string, unknown>): estypes.QueryDslQueryContainer {
    const searchParams = {...input};
    const andOr = String(searchParams.sokemodus ?? "AND").toUpperCase() as "AND" | "OR";
    const fuzzy = Boolean(searchParams.fuzzy ?? false);
    delete searchParams.sokemodus;
    delete searchParams.fuzzy;

    const sok = getGeneralSearchParameter(String(searchParams.sok ?? ""), andOr, fuzzy);
    delete searchParams.sok;

    const must: estypes.QueryDslQueryContainer[] = [];
    if (sok) {
        must.push({
            query_string: {
                query: sok,
                default_operator: andOr,
                fuzzy_max_expansions: 100,
                type: "cross_fields" as const
            }
        });
    }

    for (const [key, value] of Object.entries(searchParams)) {
        if (value === undefined || value === null) continue;
        if (manageTextField(must, key, value)) continue;
        manageInvalidWildcard(key, value);
        if (manageBokstav(must, key, value)) continue;
        must.push({match: {[key]: matchValue(value)}});
    }

    if (!must.length) {
        badRequest("Ingen søkeparametere oppgitt.");
    }

    return must.length === 1 ? must[0] : {bool: {must}};
}

function getGeneralSearchParameter(value: string, andOr: "AND" | "OR", fuzzy: boolean) {
    const search = replaceIllegalChars(value);
    const terms = search.replaceAll("-", " ").split(/\s+/).filter(Boolean);
    const fuzziedTerms = enableFuzziness(terms, fuzzy);
    return fuzziedTerms.join(` ${andOr} `);
}

function enableFuzziness(terms: string[], fuzzy: boolean) {
    if (!fuzzy) return terms;
    return terms.map((term) => {
        if (term.includes("*")) {
            badRequest("Wildcard kan ikke brukes med fuzzysøk.");
        }
        return Number.isInteger(Number(term)) ? term : `${term}~`;
    });
}

function replaceIllegalChars(value: string) {
    return value.replaceAll("\\", " ").replaceAll("/", " ").replaceAll('"', "").replaceAll("~", "").trim();
}

function manageTextField(must: estypes.QueryDslQueryContainer[], key: string, rawValue: unknown) {
    if (!textFields.has(key.toLowerCase())) return false;
    const value = replaceIllegalChars(String(rawValue));
    if (value.includes("*")) {
        must.push({
            match_phrase_prefix: {
                [key]: {
                    query: value.replaceAll("*", ""),
                    max_expansions: 500
                }
            }
        });
    } else if (["adressetekst", "adressenavn"].includes(key.toLowerCase())) {
        must.push({ match_phrase: { [key]: value } });
    } else {
        must.push({ match: { [key]: value } });
    }
    return true;
}

function manageInvalidWildcard(key: string, value: unknown) {
    if (typeof value !== "number" && String(value).includes("*")) {
        badRequest(`Wildcard er ikke støttet for parameteret ${key}.`);
    }
}

function manageBokstav(must: estypes.QueryDslQueryContainer[], key: string, value: unknown) {
    if (key.toLowerCase() !== "bokstav") return false;
    must.push({ match: { [key]: String(value).toUpperCase() } });
    return true;
}

function matchValue(value: unknown) {
    if (["string", "number", "boolean"].includes(typeof value)) {
        return value as string | number | boolean;
    }
    return String(value);
}

function sanitizeSearchString(url: URL) {
    return url.searchParams.toString().replaceAll("\\", " ").replaceAll("~", "").replaceAll("/", " ").replaceAll("%22", "");
}