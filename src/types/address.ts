export type Address = Record<string, unknown> & {
    representasjonspunkt?: {
        epsg?: string;
        lat: number;
        lon: number;
    };
    oppdateringsdato?: string;
};

export function toAddresses(hits: Array<{ _source?: Address; sort?: unknown[] }>, addDistance = false) {
    return hits.flatMap((hit) => {
        if (!hit._source) return [];
        return [
            addDistance
                ? {
                    ...hit._source,
                    meterDistanseTilPunkt: hit.sort?.[0]
                }
                : hit._source
        ];
    });
}
