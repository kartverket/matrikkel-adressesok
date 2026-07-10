import proj4 from "proj4";
import { badRequest } from "../error-handlings";
import {config} from "../config";
import {Address} from "../types/address";

proj4.defs(
  "EPSG:25833",
  "+proj=utm +zone=33 +ellps=GRS80 +units=m +no_defs +type=crs"
);

export function reprojectAddresses(addresses: Address[], outputSrid: number) {
  if (outputSrid === config.defaultSrid) return addresses;

  validateSrid(outputSrid);
  return addresses.map((address) => {
    if (!address.representasjonspunkt) return address;

    const point = address.representasjonspunkt;
    const [outEast, outNorth] = proj4(`EPSG:${config.defaultSrid}`, `EPSG:${outputSrid}`, [point.lon, point.lat]);
    return {
      ...address,
      representasjonspunkt: {
        ...point,
        epsg: `EPSG:${outputSrid}`,
        lat: Number(outNorth.toFixed(7)),
        lon: Number(outEast.toFixed(7))
      }
    };
  });
}

export function reprojectToDefaultSrid(lat: number, lon: number, inputSrid: number) {
  if (inputSrid === config.defaultSrid) {
    if (lat > 80 || lat < 57) {
      badRequest({ lat: ["lat-koordinatene er utenfor Norge."] });
    }
    if (lon > 31 || lon < 4) {
      badRequest({ lon: ["lat-koordinatene er utenfor Norge."] });
    }
    return { lat, lon };
  }

  validateSrid(inputSrid);
  try {
    const [outLon, outLat] = proj4(`EPSG:${inputSrid}`, `EPSG:${config.defaultSrid}`, [lon, lat]);
    if (!Number.isFinite(outLon) || !Number.isFinite(outLat)) {
      throw new Error("Invalid transformed coordinates");
    }
    return { lat: outLat, lon: outLon };
  } catch {
    badRequest(`Koordinatene som ble gitt kunne ikke transformeres: ${lat},${lon}`);
  }
}

function validateSrid(srid: number) {
  try {
    proj4(`EPSG:${srid}`);
  } catch {
    badRequest(`Ukjent srid/epsg: ${srid}`);
  }
}
