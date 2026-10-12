import epsgIndex from "epsg-index/all.json" with { type: "json" };
import proj4 from "proj4";

/**
 * SRID-en adressesok (hovedappen) forventer at `representasjonspunkt` ligger
 * i - se apps/adressesok/src/projection.ts sin `DEFAULT_SRID`. Databricks
 * leverer koordinatene i UTM33N (EPSG:25833), så de må reprojiseres før de
 * sendes til Elasticsearch.
 */
export const SOURCE_SRID = 25833;
export const TARGET_SRID = 4258;

function projection(srid: number): string {
  const name = `EPSG:${srid}`;
  if (proj4.defs(name)) return name;

  const definition = (epsgIndex as Record<string, { proj4: string | null }>)[String(srid)]?.proj4;
  if (!definition) throw new Error(`Ukjent srid/epsg: ${srid}`);
  proj4.defs(name, definition);
  return name;
}

const source = projection(SOURCE_SRID);
const target = projection(TARGET_SRID);

/**
 * Reprojiserer et punkt fra kilde-SRID (UTM33N) til mål-SRID (ETRS89/4258,
 * grader). Returnerer null hvis koordinatene mangler eller ikke lar seg
 * transformere, slik at en enkelt rar rad ikke stopper hele lastingen.
 */
export function reprojectToTargetSrid(
  lat: number,
  lon: number,
): { lat: number; lon: number } | null {
  try {
    const [transformedLon, transformedLat] = proj4(source, target, [lon, lat]);
    if (!Number.isFinite(transformedLat) || !Number.isFinite(transformedLon)) return null;
    return { lat: transformedLat, lon: transformedLon };
  } catch {
    return null;
  }
}
