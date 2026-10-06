import type { AddressDocument, DatabricksRow } from "./schema";

export function rowToDocument(row: DatabricksRow, timestamp: string): AddressDocument | null {
  if (row.lokalid == null || row.lokalid === "") return null;

  const { representasjonspunkt_lat: lat, representasjonspunkt_lon: lon, ...rest } = row;

  return {
    ...rest,
    lokalid: String(row.lokalid),
    representasjonspunkt: makeGeoPointIfBothCoordinatesExist(lat, lon),
    "@version": "2",
    "@timestamp": timestamp,
  };
}

function makeGeoPointIfBothCoordinatesExist(lat: number | null, lon: number | null) {
  // geo_point-mappingen avviser {lat: null}, så punktet må utelates helt.
  return lat != null && lon != null ? { lat, lon } : null;
}
