import { z } from "zod";
import type { AddressDocument } from "../elasticsearch";
import { badRequest } from "../http";
import { DEFAULT_SRID } from "../projection";

export interface MetadataOutput {
  treffPerSide: number;
  side: number;
  totaltAntallTreff: number;
  viserFra: number;
  viserTil: number;
  sokeStreng: string;
  asciiKompatibel: true;
}

export interface AddressListOutput {
  metadata: MetadataOutput;
  adresser: Record<string, unknown>[];
}

const nullableString = z.string().nullable().default(null);
const nullableInteger = z.number().int().nullable().default(null);
const RepresentationPointSchema = z.object({
  epsg: z.string().default(`EPSG:${DEFAULT_SRID}`),
  lat: z.number(),
  lon: z.number(),
});
const AddressOutputSchema = z.object({
  adressenavn: nullableString,
  adressetekst: nullableString,
  adressetilleggsnavn: nullableString,
  adressekode: nullableInteger,
  nummer: nullableInteger,
  bokstav: nullableString,
  kommunenummer: z.string().nullable().optional(),
  kommunenavn: nullableString,
  gardsnummer: nullableInteger,
  bruksnummer: nullableInteger,
  festenummer: nullableInteger,
  undernummer: nullableInteger,
  bruksenhetsnummer: z.array(z.string()).nullable().optional(),
  objtype: z.enum(["Vegadresse", "Matrikkeladresse"]).nullable().default(null),
  poststed: nullableString,
  postnummer: nullableString,
  adressetekstutenadressetilleggsnavn: nullableString,
  stedfestingverifisert: z.boolean().nullable().optional(),
  representasjonspunkt: RepresentationPointSchema.nullable().optional(),
  oppdateringsdato: nullableString,
});
const GeoAddressOutputSchema = AddressOutputSchema.extend({
  meterDistanseTilPunkt: z.number().optional(),
});

const pointFields = new Set(["epsg", "lat", "lon"]);
const metadataFields = new Set<string>([
  "sokeStreng",
  "totaltAntallTreff",
  "viserFra",
  "asciiKompatibel",
  "side",
  "treffPerSide",
  "viserTil",
] satisfies Array<keyof MetadataOutput>);

function topLevelSelectors(prefix: string, fields: Set<string>): Set<string> {
  const selectors = new Set([prefix]);
  for (const field of fields) {
    selectors.add(`${prefix}.${field}`);
  }
  return selectors;
}

function addressSelectors(schema: typeof AddressOutputSchema): Set<string> {
  const selectors = topLevelSelectors("adresser", new Set(Object.keys(schema.shape)));
  for (const field of pointFields) {
    selectors.add(`adresser.representasjonspunkt.${field}`);
  }
  return selectors;
}

const metadataSelectors = topLevelSelectors("metadata", metadataFields);
const standardAddressSelectors = addressSelectors(AddressOutputSchema);
const geoAddressSelectors = addressSelectors(GeoAddressOutputSchema);

function addressOutputInput(address: AddressDocument): Record<string, unknown> {
  return {
    ...address,
    kommunenummer: address.adresse_kommunenummer,
    oppdateringsdato: address.oppdateringsdato?.replace(
      /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.\d+)?Z$/,
      "$1",
    ),
  };
}

export function serializeAddress(address: AddressDocument): Record<string, unknown> {
  return AddressOutputSchema.parse(addressOutputInput(address));
}

export function serializeGeoAddress(address: AddressDocument): Record<string, unknown> {
  return GeoAddressOutputSchema.parse(addressOutputInput(address));
}

interface OutputSelection {
  metadata: string[][];
  addresses: string[][];
}

function parseOutputSelection(
  filter: string,
  allowedAddressSelectors: Set<string>,
): OutputSelection {
  const selection: OutputSelection = { metadata: [], addresses: [] };
  for (const selector of filter.split(",")) {
    const selectedFields = selector.split(".").slice(1);
    if (metadataSelectors.has(selector)) {
      selection.metadata.push(selectedFields);
      continue;
    }
    if (allowedAddressSelectors.has(selector)) {
      selection.addresses.push(selectedFields);
      continue;
    }
    badRequest("Feil i filtreringsparameter");
  }
  return selection;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function copyNestedField(
  source: Record<string, unknown>,
  target: Record<string, unknown>,
  field: string,
  nestedField: string,
): void {
  const sourceValue = source[field];
  if (!isRecord(sourceValue)) return;

  const nestedValue = sourceValue[nestedField];
  if (nestedValue === undefined) return;

  const existingTarget = target[field];
  let nestedTarget: Record<string, unknown>;
  if (isRecord(existingTarget)) {
    nestedTarget = existingTarget;
  } else {
    nestedTarget = {};
  }
  nestedTarget[nestedField] = nestedValue;
  target[field] = nestedTarget;
}

function selectFields(source: Record<string, unknown>, paths: string[][]): Record<string, unknown> {
  if (paths.some((path) => path.length === 0)) return source;
  const selected: Record<string, unknown> = {};
  for (const [field, nestedField] of paths) {
    if (!field) continue;
    if (nestedField) {
      copyNestedField(source, selected, field, nestedField);
      continue;
    }

    const value = source[field];
    if (value !== undefined) selected[field] = value;
  }
  return selected;
}

function filterOutput(
  output: AddressListOutput,
  filter: string | undefined,
  allowedAddressSelectors: Set<string>,
): AddressListOutput | Record<string, unknown> {
  if (!filter) return output;
  const selection = parseOutputSelection(filter, allowedAddressSelectors);
  const result: Record<string, unknown> = {};
  if (selection.metadata.length > 0) {
    const metadataRecord: Record<string, unknown> = { ...output.metadata };
    result.metadata = selectFields(metadataRecord, selection.metadata);
  }
  if (selection.addresses.length > 0) {
    result.adresser = output.adresser.map((address) => selectFields(address, selection.addresses));
  }
  return result;
}

export function filterAddressOutput(
  output: AddressListOutput,
  filter: string | undefined,
): AddressListOutput | Record<string, unknown> {
  return filterOutput(output, filter, standardAddressSelectors);
}

export function filterGeoAddressOutput(
  output: AddressListOutput,
  filter: string | undefined,
): AddressListOutput | Record<string, unknown> {
  return filterOutput(output, filter, geoAddressSelectors);
}

export function metadata(
  treffPerSide: number,
  side: number,
  total: number,
  query: string,
): MetadataOutput {
  return {
    treffPerSide,
    side,
    totaltAntallTreff: total,
    viserFra: side * treffPerSide,
    viserTil: (side + 1) * treffPerSide,
    sokeStreng: query,
    asciiKompatibel: true,
  };
}

export function rawQuery(url: string): string {
  return new URL(url).search.slice(1);
}
