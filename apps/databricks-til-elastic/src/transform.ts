import { logger } from "./logger";
import type {
  AddressDocument,
  DatabricksAtkomstpunkt,
  DatabricksPoint,
  DatabricksRow,
} from "./schema";

const OBJTYPE_TIL_HOVEDAPPENS_FORM: Record<string, "Vegadresse" | "Matrikkeladresse"> = {
  vegadresse: "Vegadresse",
  matrikkeladresse: "Matrikkeladresse",
};

export function rowToDocument(row: DatabricksRow, timestamp: string): AddressDocument | null {
  if (row.lokalid == null || row.lokalid === "") return null;

  const { representasjonspunkt, atkomstpunkt, bruksenhetsnummer, objtype, ...rest } = row;

  return {
    ...rest,
    lokalid: String(row.lokalid),
    adresseid: row.adresseid == null ? null : String(row.adresseid),
    objtype: normaliserObjtype(objtype, row.lokalid),
    bruksenhetsnummer: parseBruksenhetsnummer(bruksenhetsnummer, row.lokalid),
    representasjonspunkt: parseJsonPoint(representasjonspunkt, row.lokalid),
    atkomstpunkt: parseAtkomstpunkt(atkomstpunkt, row.lokalid),
    "@version": "2",
    "@timestamp": timestamp,
  };
}

/**
 * Databricks sender lowercase objtype-verdier (`"vegadresse"`,
 * `"matrikkeladresse"`), mens hovedappens `AddressDocument` (og dagens
 * Elasticsearch-data) bruker de kapitaliserte formene fra kodelista.
 */
function normaliserObjtype(
  objtype: DatabricksRow["objtype"],
  lokalid: string | number | null,
): "Vegadresse" | "Matrikkeladresse" | null {
  if (objtype == null) return null;
  const normalisert = OBJTYPE_TIL_HOVEDAPPENS_FORM[objtype];
  if (!normalisert) {
    logger.warn({ lokalid, objtype }, "ukjent objtype fra Databricks, hopper over verdien");
    return null;
  }
  return normalisert;
}

/**
 * Databricks sender `bruksenhetsnummer` som en JSON-array-streng, f.eks.
 * `["H0101","H0102"]` eller `["","H0101"]`. Tomme strenger i arrayet er ikke
 * reelle bruksenhetsnummer og filtreres bort.
 */
function parseBruksenhetsnummer(
  value: string | null,
  lokalid: string | number | null,
): string[] | null {
  if (value == null || value === "") return null;

  const parsed = parseJson<unknown>(value, lokalid, "bruksenhetsnummer");
  if (!Array.isArray(parsed)) return null;

  const bruksenhetsnummer = parsed.filter((v): v is string => typeof v === "string" && v !== "");
  return bruksenhetsnummer.length > 0 ? bruksenhetsnummer : null;
}

/**
 * `representasjonspunkt` kommer som en JSON-objekt-streng med koordinater
 * allerede i EPSG:4258 (grader), samme SRID som hovedappen forventer - ingen
 * reprojeksjon nødvendig. geo_point-mappingen avviser halve/manglende punkt,
 * så hele feltet blir null hvis noe mangler eller ikke lar seg tolke.
 */
function parseJsonPoint(
  value: string | null,
  lokalid: string | number | null,
): { lat: number; lon: number } | null {
  const point = parseJson<DatabricksPoint>(value, lokalid, "representasjonspunkt");
  if (!point || point.lat == null || point.lon == null) return null;
  return { lat: point.lat, lon: point.lon };
}

/**
 * `atkomstpunkt` er nesten alltid null i praksis, men når den er satt
 * inneholder den opptil tre varianter (sommer/vinter/generell) av samme
 * adkomstpunkt, hver i samme SRID (EPSG:4258) som `representasjonspunkt`.
 */
function parseAtkomstpunkt(
  value: string | null,
  lokalid: string | number | null,
): DatabricksAtkomstpunkt | null {
  const atkomstpunkt = parseJson<{
    sommer?: DatabricksPoint | null;
    vinter?: DatabricksPoint | null;
    generell?: DatabricksPoint | null;
  }>(value, lokalid, "atkomstpunkt");
  if (!atkomstpunkt) return null;

  const normalizeVariant = (point: DatabricksPoint | null | undefined) =>
    point == null || point.lat == null || point.lon == null
      ? null
      : { lat: point.lat, lon: point.lon };

  return {
    sommer: normalizeVariant(atkomstpunkt.sommer),
    vinter: normalizeVariant(atkomstpunkt.vinter),
    generell: normalizeVariant(atkomstpunkt.generell),
  };
}

function parseJson<T>(
  value: string | null,
  lokalid: string | number | null,
  felt: string,
): T | null {
  if (value == null || value === "" || value === "null") return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    logger.warn({ lokalid, felt, value }, "klarte ikke tolke JSON-felt fra Databricks");
    return null;
  }
}
