

export type StandardParams = {
    treffPerSide: number;
    side: number;
    filtrer?: string;
    asciiKompatibel: boolean;
    utkoordsys: number;
};

export type SearchParams = StandardParams & {
    sok?: string;
    fuzzy: boolean;
    sokemodus: "AND" | "OR";
    [key: string]: unknown;
};

export type PointSearchParams = StandardParams & {
    lat: number;
    lon: number;
    radius: number;
    koordsys: number;
};
