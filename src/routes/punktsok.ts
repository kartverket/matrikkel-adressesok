import {Handler} from "hono";
import {buildResponse, getTotalHits} from "../types/searchResponse";
import {Address, toAddresses} from "../types/address";
import {reprojectAddresses, reprojectToDefaultSrid} from "../utils/projection";
import {parsePointSearchParams, splitStandardParams} from "../utils/validation";
import {Client} from "@elastic/elasticsearch";

type Config = {
    esClient: Client;
    index: string;
};

export function punktsokHandlerFactory(config: Config): Handler {
    return async (c, next) => {
        const url = new URL(c.req.url);
        const params = parsePointSearchParams(url);
        const {standard, searchParams} = splitStandardParams(params);
        const lat = Number(searchParams.lat);
        const lon = Number(searchParams.lon);
        const radius = Number(searchParams.radius);
        const koordsys = Number(searchParams.koordsys);
        const point = reprojectToDefaultSrid(lat, lon, koordsys);
        const from = standard.side * standard.treffPerSide;

        const result = await config.esClient.search<Address>({
            index: config.index,
            from,
            size: standard.treffPerSide,
            query: {query_string: {query: "*"}},
            _source_excludes: ["objid"],
            sort: [
                {
                    _geo_distance: {
                        representasjonspunkt: {lat: point.lat, lon: point.lon},
                        order: "asc",
                        unit: "m",
                        distance_type: "arc"
                    }
                }
            ],
            post_filter: {
                geo_distance: {
                    distance: `${radius}m`,
                    representasjonspunkt: {lat: point.lat, lon: point.lon}
                }
            }
        });

        const addresses = reprojectAddresses(toAddresses(result.hits.hits, true), standard.utkoordsys);
        const response = buildResponse(standard, getTotalHits(result.hits.total), addresses, url.searchParams.toString());
        return c.json(response);
    }
}
