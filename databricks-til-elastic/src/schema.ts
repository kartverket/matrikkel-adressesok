import type { estypes } from "@elastic/elasticsearch";
import type { AddressDocument as HovedappensAddressDocument } from "@matrikkel/shared-schema";

/**
 * Raden slik den kommer fra Databricks-tabellen. Én flat tabell dekker
 * både vegadresse og matrikkeladresse.
 */
export interface DatabricksRow {
  lokalid: string | number | null;
  objtype: "Vegadresse" | "Matrikkeladresse" | null;
  oppdateringsdato: string | null;
  representasjonspunkt_lon: number | null;
  representasjonspunkt_lat: number | null;
  adressetilleggsnavn: string | null;
  kommunenavn: string | null;
  postnummer: string | null;
  poststed: string | null;
  adresse_kommunenummer: string | null;
  gardsnummer: number | null;
  bruksnummer: number | null;
  festenummer: number | null;
  stedfestingverifisert: boolean | null;
  adressetekst: string | null;
  adressetekstutenadressetilleggsnavn: string | null;
  bruksenhetsnummer: string | null;
  undernummer: number | null;
  adressekode: string | null;
  bokstav: string | null;
  adressenavn: string | null;
  nummer: number | null;
}

/**
 * Kolonner vi henter fra Databricks-tabellen, i den rekkefølgen de velges
 * ut i SQL-spørringen. Typet mot `DatabricksRow` slik at en feilstavet
 * kolonne feiler på kompileringstidspunktet.
 */
export const COLUMNS: ReadonlyArray<keyof DatabricksRow> = [
  "lokalid",
  "objtype",
  "oppdateringsdato",
  "representasjonspunkt_lon",
  "representasjonspunkt_lat",
  "adressetilleggsnavn",
  "kommunenavn",
  "postnummer",
  "poststed",
  "adresse_kommunenummer",
  "gardsnummer",
  "bruksnummer",
  "festenummer",
  "stedfestingverifisert",
  "adressetekst",
  "adressetekstutenadressetilleggsnavn",
  "bruksenhetsnummer",
  "undernummer",
  "adressekode",
  "bokstav",
  "adressenavn",
  "nummer",
];

/**
 * Dokumentet slik det ligger i Elasticsearch - hovedappens `AddressDocument`
 * pluss feltene jobben selv trenger for indeksering. Speiler `MAPPING`
 * under. `transform.ts` er eneste sted som bygger disse.
 *
 * `adressekode` og `bruksenhetsnummer` overstyrer hovedappens typer inntil
 * videre: dataene sendes uendret fra Databricks uten tolkning.
 */
export interface AddressDocument
  extends Omit<HovedappensAddressDocument, "adressekode" | "bruksenhetsnummer"> {
  lokalid: string;
  adressekode: string | null;
  bruksenhetsnummer: string | null;
  "@version": string;
  "@timestamp": string;
}

const tekst: estypes.MappingProperty = {
  type: "text",
  analyzer: "adresse",
  fields: { raw: { type: "keyword" } },
};

/**
 * `dynamic: strict` gjør at en ny kolonne i databasen feiler synlig
 * istedenfor å bli indeksert som noe tilfeldig.
 */
export const MAPPING: Pick<estypes.IndicesCreateRequest, "settings" | "mappings"> = {
  settings: {
    index: { number_of_shards: 1, number_of_replicas: 0, refresh_interval: "-1" },
    analysis: {
      analyzer: {
        adresse: { type: "custom", tokenizer: "standard", filter: ["lowercase", "asciifolding"] },
      },
    },
  },
  mappings: {
    dynamic: "strict",
    properties: {
      "@timestamp": { type: "date" },
      "@version": { type: "keyword" },
      lokalid: { type: "keyword" },
      objtype: { type: "keyword" },
      oppdateringsdato: { type: "date" },
      representasjonspunkt: { type: "geo_point" },
      adressetekst: tekst,
      adressetekstutenadressetilleggsnavn: tekst,
      adressetilleggsnavn: tekst,
      adressenavn: tekst,
      kommunenavn: tekst,
      poststed: tekst,
      postnummer: { type: "keyword" },
      adresse_kommunenummer: { type: "keyword" },
      adressekode: { type: "keyword" },
      bokstav: { type: "keyword" },
      bruksenhetsnummer: { type: "keyword" },
      gardsnummer: { type: "integer" },
      bruksnummer: { type: "integer" },
      festenummer: { type: "integer" },
      undernummer: { type: "integer" },
      nummer: { type: "integer" },
      stedfestingverifisert: { type: "boolean" },
    },
  },
};
