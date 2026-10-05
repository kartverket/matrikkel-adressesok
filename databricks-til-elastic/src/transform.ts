import type { AddressDocument, DatabricksRow } from "./schema";

export function radTilDokument(row: DatabricksRow, timestamp: string): AddressDocument | null {
  if (row.lokalid == null || row.lokalid === "") return null;

  const { representasjonspunkt_lat: lat, representasjonspunkt_lon: lon, ...rest } = row;

  return {
    ...rest,
    lokalid: String(row.lokalid),
    representasjonspunkt: lagGeoPointHvisBeggeKoordinaterFinnes(lat, lon),
    "@version": "2",
    "@timestamp": timestamp,
  };
}

function lagGeoPointHvisBeggeKoordinaterFinnes(lat: number | null, lon: number | null) {
  // geo_point-mappingen avviser {lat: null}, så punktet må utelates helt.
  return lat != null && lon != null ? { lat, lon } : null;
}
