import { badRequest } from "../error-handlings";
import type { PointSearchParams, SearchParams, StandardParams } from "../types/types";
import {getQueryParameterNames} from "../openapi";

const integerFields = new Set([
    "treffPerSide",
    "side",
    "utkoordsys",
    "adressekode",
    "nummer",
    "gardsnummer",
    "bruksnummer",
    "festenummer",
    "undernummer",
    "radius",
    "koordsys"
]);

export const allowedSearchFields = new Set(getQueryParameterNames("/sok"));
export const allowedPointSearchFields = new Set(getQueryParameterNames("/punktsok"));

const standardFields = new Set(["treffPerSide", "side", "filtrer", "asciiKompatibel", "utkoordsys"]);

export function parseSearchParams(url: URL): SearchParams {
    const params = parseQuery(url);
    rejectUnknownParams(params, allowedSearchFields);

    const parsed = applyDefaults(params) as SearchParams;
    parsed.fuzzy = parseBoolean(params.fuzzy, false);
    parsed.sokemodus = String(params.sokemodus ?? "AND").toUpperCase() as "AND" | "OR";

    if (!["AND", "OR"].includes(parsed.sokemodus)) {
        badRequest({ sokemodus: ["Feil i søkeparameter. Gyldige verdier er: ('AND', 'OR')"] });
    }

    if (parsed.objtype !== undefined && !["Matrikkeladresse", "Vegadresse"].includes(String(parsed.objtype))) {
        badRequest({ objtype: ["Feil i søkeparameter. Gyldige verdier er: ('Matrikkeladresse', 'Vegadresse')"] });
    }

    validatePaging(parsed);
    return parsed;
}

export function parsePointSearchParams(url: URL): PointSearchParams {
    const params = parseQuery(url);
    rejectUnknownParams(params, allowedPointSearchFields);

    if (params.lat === undefined) badRequest({ lat: ["Missing data for required field."] });
    if (params.lon === undefined) badRequest({ lon: ["Missing data for required field."] });
    if (params.radius === undefined) badRequest({ radius: ["Missing data for required field."] });

    const parsed = applyDefaults(params) as PointSearchParams;
    parsed.lat = parseNumber(params.lat, "lat");
    parsed.lon = parseNumber(params.lon, "lon");
    parsed.radius = parseInteger(params.radius, "radius");
    parsed.koordsys = parseInteger(params.koordsys ?? "4258", "koordsys");

    validatePaging(parsed);
    return parsed;
}

export function splitStandardParams<T extends StandardParams>(params: T) {
    const searchParams = { ...params } as Record<string, unknown>;
    for (const key of standardFields) {
        delete searchParams[key];
    }

    return {
        standard: {
            treffPerSide: params.treffPerSide,
            side: params.side,
            filtrer: params.filtrer,
            asciiKompatibel: params.asciiKompatibel,
            utkoordsys: params.utkoordsys
        },
        searchParams
    };
}

function applyDefaults(params: Record<string, string>) {
    const withDefaults: Record<string, unknown> = {
        ...params,
        treffPerSide: parseInteger(params.treffPerSide ?? "10", "treffPerSide"),
        side: parseInteger(params.side ?? "0", "side"),
        asciiKompatibel: parseBoolean(params.asciiKompatibel, true),
        utkoordsys: parseInteger(params.utkoordsys ?? "4258", "utkoordsys")
    };

    for (const [key, value] of Object.entries(params)) {
        if (integerFields.has(key)) {
            withDefaults[key] = parseInteger(value, key);
        }
    }

    if ("kommunenummer" in params) {
        withDefaults.adresse_kommunenummer = params.kommunenummer;
        delete withDefaults.kommunenummer;
    }

    return withDefaults;
}

function parseQuery(url: URL) {
    const values: Record<string, string> = {};
    for (const [key, value] of url.searchParams.entries()) {
        values[key] = value;
    }
    return values;
}

export function rejectUnknownParams(params: Record<string, string>, allowed: Set<string>) {
    const unknown = Object.keys(params).filter((key) => !allowed.has(key));
    if (unknown.length) {
        badRequest(Object.fromEntries(unknown.map((key) => [key, ["Unknown field."]])));
    }
}

function parseInteger(value: string, field: string) {
    const number = Number(value);
    if (!Number.isInteger(number)) {
        badRequest({ [field]: ["Not a valid integer."] });
    }
    return number;
}

function parseNumber(value: string, field: string) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
        badRequest({ [field]: ["Not a valid number."] });
    }
    return number;
}

function parseBoolean(value: string | undefined, defaultValue: boolean) {
    if (value === undefined) return defaultValue;
    if (["true", "1", "yes", "on"].includes(value.toLowerCase())) return true;
    if (["false", "0", "no", "off"].includes(value.toLowerCase())) return false;
    badRequest(["Not a valid boolean."]);
}

function validatePaging(params: StandardParams) {
    if (params.treffPerSide > 1000) {
        badRequest({ treffPerSide: ["Antallet treff per side er satt for høyt."] });
    }
    if (params.treffPerSide * (params.side + 1) > 10_000) {
        badRequest({
            side: [
                "Api-et returner ikke mer enn de første 10 000 treffene. Men datasettet kan lastes ned i sin helhet fra Geonorge.no ."
            ]
        });
    }
}
