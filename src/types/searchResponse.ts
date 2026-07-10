import {StandardParams} from "../routes/types";
import {Address} from "./address";
import {badRequest} from "../error-handlings";

type SearchResponse = {
    metadata: {
        treffPerSide: number;
        side: number;
        totaltAntallTreff: number;
        viserFra: number;
        viserTil: number;
        sokeStreng: string;
    };
    adresser: Address[];
};

export function buildResponse(
    standard: StandardParams,
    totalHits: number,
    addresses: Address[],
    searchString: string
) {
    const sliceFrom = standard.side * standard.treffPerSide;
    const sliceTo = (standard.side + 1) * standard.treffPerSide;
    const response: SearchResponse = {
        metadata: {
            treffPerSide: standard.treffPerSide,
            side: standard.side,
            totaltAntallTreff: totalHits,
            viserFra: sliceFrom,
            viserTil: sliceTo,
            sokeStreng: searchString
        },
        adresser: normalizeAddresses(addresses)
    };

    return applyFilter(response, standard.filtrer);
}

export function getTotalHits(total: number | { value: number } | undefined) {
    if (typeof total === "number") return total;
    return total?.value ?? 0;
}

function normalizeAddresses(addresses: Address[]) {
    return addresses.map((address) => {
        const normalized = { ...address };
        if ("adresse_kommunenummer" in normalized) {
            normalized.kommunenummer = normalized.adresse_kommunenummer;
            delete normalized.adresse_kommunenummer;
        }
        if (typeof normalized.oppdateringsdato === "string") {
            normalized.oppdateringsdato = normalized.oppdateringsdato.replace(/\.\d+Z$/, "").replace(/Z$/, "");
        }
        return normalized;
    });
}

function applyFilter(response: SearchResponse, filter?: string) {
    if (!filter) return response;

    const output: Record<string, unknown> = {};
    for (const field of filter.split(",").map((item) => item.trim()).filter(Boolean)) {
        if (!field.startsWith("metadata.") && !field.startsWith("adresser.")) {
            badRequest("Feil i filtreringsparameter");
        }
        copyPath(response, output, field.split("."));
    }
    return output;
}

function copyPath(source: unknown, target: Record<string, unknown>, path: string[]) {
    const [head, ...tail] = path;
    if (!head) return;

    if (!(typeof source === "object" && source !== null && head in source)) {
        badRequest("Feil i filtreringsparameter. Husk på at underelementer må spesifiseres slik: filtrer=adresser.nummer");
    }

    const sourceValue = (source as Record<string, unknown>)[head];
    if (tail.length === 0) {
        target[head] = sourceValue;
        return;
    }

    if (Array.isArray(sourceValue)) {
        target[head] = sourceValue.map((item) => {
            const child: Record<string, unknown> = {};
            copyPath(item, child, tail);
            return child;
        });
        return;
    }

    const child = (target[head] ?? {}) as Record<string, unknown>;
    target[head] = child;
    copyPath(sourceValue, child, tail);
}

