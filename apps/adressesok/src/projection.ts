import epsgIndex from "epsg-index/all.json" with { type: "json" };
import proj4 from "proj4";
import type { AddressDocument } from "./elasticsearch";
import { badRequest, HttpError } from "./http";

export const DEFAULT_SRID = 4258;

interface Coordinate {
  lat: number;
  lon: number;
}

interface EpsgDefinition {
  proj4: string | null;
}

const definitions = epsgIndex as Record<string, EpsgDefinition>;

function projection(srid: number): string {
  const name = `EPSG:${srid}`;
  if (proj4.defs(name)) return name;

  const definition = definitions[String(srid)]?.proj4;
  if (!definition) badRequest(`Ukjent srid/epsg: ${srid}`);
  proj4.defs(name, definition);
  return name;
}

function transform({ lat, lon }: Coordinate, sourceSrid: number, targetSrid: number): Coordinate {
  const source = projection(sourceSrid);
  const target = projection(targetSrid);
  try {
    const [transformedLon, transformedLat] = proj4(source, target, [lon, lat]);
    if (!Number.isFinite(transformedLat) || !Number.isFinite(transformedLon)) {
      throw new Error("Invalid projected coordinate");
    }
    return { lat: transformedLat, lon: transformedLon };
  } catch {
    throw new Error("Coordinate transformation failed");
  }
}

function validateDefaultCoordinates(lat: number, lon: number): void {
  if (lat > 80 || lat < 57) {
    badRequest({ lat: ["lat-koordinatene er utenfor Norge."] });
  }
  if (lon > 31 || lon < 4) {
    badRequest({ lon: ["lat-koordinatene er utenfor Norge."] });
  }
}

export function reprojectInputToDefault(lat: number, lon: number, inputSrid: number): Coordinate {
  if (inputSrid === DEFAULT_SRID) {
    validateDefaultCoordinates(lat, lon);
    return { lat, lon };
  }

  try {
    return transform({ lat, lon }, inputSrid, DEFAULT_SRID);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    badRequest(`Koordinatene som ble gitt kunne ikke transformeres: (${lat}, ${lon})`);
  }
}

export function reprojectAddresses(
  addresses: AddressDocument[],
  outputSrid: number,
): AddressDocument[] {
  if (outputSrid === DEFAULT_SRID) return addresses;

  return addresses.map((address) => {
    if (!address.representasjonspunkt) return address;
    let point: Coordinate;
    try {
      point = transform(address.representasjonspunkt, DEFAULT_SRID, outputSrid);
    } catch (error) {
      if (error instanceof HttpError) throw error;
      badRequest(`Ukjent srid/epsg: ${outputSrid}`);
    }
    return {
      ...address,
      representasjonspunkt: {
        epsg: `EPSG:${outputSrid}`,
        lat: Number(point.lat.toFixed(7)),
        lon: Number(point.lon.toFixed(7)),
      },
    };
  });
}
