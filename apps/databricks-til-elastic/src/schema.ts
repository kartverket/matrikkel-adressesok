import type { estypes } from "@elastic/elasticsearch";
import type { AddressDocument as HovedappensAddressDocument } from "@matrikkel/shared-schema";

/**
 * Et punkt slik Databricks sender det: JSON-objekt med lat/lon allerede i
 * EPSG:4258 (grader) - samme SRID som hovedappen forventer.
 */
export interface DatabricksPoint {
  lat: number;
  lon: number;
}

/**
 * `atkomstpunkt` modellert etter kodelista `TypeAtkomst` (produktspek.
 * kap. 5.1.2.17) - sommer/vinter/generell-varianter av samme adkomstpunkt.
 * Nesten alltid null i praksis.
 */
export interface DatabricksAtkomstpunkt {
  sommer: DatabricksPoint | null;
  vinter: DatabricksPoint | null;
  generell: DatabricksPoint | null;
}

/**
 * Raden slik den kommer fra Databricks-tabellen. Én flat tabell dekker
 * både vegadresse og matrikkeladresse.
 */
export interface DatabricksRow {
  lokalid: string | number | null;
  adresseid: string | number | null;
  objid: string | null;
  objtype: "vegadresse" | "matrikkeladresse" | null;
  oppdateringsdato: string | null;
  adressetilleggsnavn: string | null;
  kortnavn: string | null;
  kommunenavn: string | null;
  postnummer: string | null;
  poststed: string | null;
  adresse_kommunenummer: string | null;
  gardsnummer: number | null;
  bruksnummer: number | null;
  festenummer: number | null;
  seksjonsnummer: number | null;
  stedfestingverifisert: boolean | null;
  adressetekst: string | null;
  adressetekstutenadressetilleggsnavn: string | null;
  /** JSON-array som streng fra Databricks, f.eks. `["H0101","H0102"]`. */
  bruksenhetsnummer: string | null;
  adressekode: string | null;
  bokstav: string | null;
  adressenavn: string | null;
  nummer: number | null;
  /** JSON-objekt som streng fra Databricks, se `DatabricksAtkomstpunkt`. */
  atkomstpunkt: string | null;
  /** JSON-objekt som streng fra Databricks, se `DatabricksPoint`. */
  representasjonspunkt: string | null;
}

/**
 * Kolonner vi henter fra Databricks-tabellen, i den rekkefølgen de velges
 * ut i SQL-spørringen. Typet mot `DatabricksRow` slik at en feilstavet
 * kolonne feiler på kompileringstidspunktet.
 */
export const COLUMNS: ReadonlyArray<keyof DatabricksRow> = [
  "lokalid",
  "adresseid",
  "objid",
  "objtype",
  "oppdateringsdato",
  "adressetilleggsnavn",
  "kortnavn",
  "kommunenavn",
  "postnummer",
  "poststed",
  "adresse_kommunenummer",
  "gardsnummer",
  "bruksnummer",
  "festenummer",
  "seksjonsnummer",
  "stedfestingverifisert",
  "adressetekst",
  "adressetekstutenadressetilleggsnavn",
  "bruksenhetsnummer",
  "adressekode",
  "bokstav",
  "adressenavn",
  "nummer",
  "atkomstpunkt",
  "representasjonspunkt",
];

/**
 * Dokumentet slik det ligger i Elasticsearch - hovedappens `AddressDocument`
 * pluss feltene jobben selv trenger for indeksering. Speiler `MAPPING`
 * under. `transform.ts` er eneste sted som bygger disse.
 *
 * `adresseid`, `objid`, `kortnavn`, `seksjonsnummer` og `atkomstpunkt`
 * finnes ikke i hovedappens `AddressDocument` - de lagres og indekseres,
 * men hovedappens søke-API eksponerer dem ikke (`objid` ekskluderes
 * allerede eksplisitt fra `_source` i search.ts/point-search.ts).
 *
 * `adressekode` overstyrer hovedappens type inntil videre: 100% null i alle
 * data vi har sett så langt, så den reelle typen er ukjent.
 */
export interface AddressDocument extends Omit<HovedappensAddressDocument, "adressekode"> {
  lokalid: string;
  adresseid: string | null;
  objid: string | null;
  kortnavn: string | null;
  seksjonsnummer: number | null;
  atkomstpunkt: DatabricksAtkomstpunkt | null;
  adressekode: string | null;
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
      adresseid: { type: "keyword" },
      objid: { type: "keyword" },
      objtype: { type: "keyword" },
      oppdateringsdato: {
        type: "date",
        // Databricks sender "yyyy-MM-dd HH:mm:ss.SSS" (mellomrom, ikke "T").
        // Ingen transformasjon av verdien - mappingen må godta rå-formatet.
        format: "yyyy-MM-dd HH:mm:ss.SSS||strict_date_optional_time||epoch_millis",
      },
      representasjonspunkt: { type: "geo_point" },
      atkomstpunkt: {
        properties: {
          sommer: { type: "geo_point" },
          vinter: { type: "geo_point" },
          generell: { type: "geo_point" },
        },
      },
      adressetekst: tekst,
      adressetekstutenadressetilleggsnavn: tekst,
      adressetilleggsnavn: tekst,
      adressenavn: tekst,
      kortnavn: tekst,
      kommunenavn: tekst,
      poststed: tekst,
      postnummer: { type: "keyword" },
      adresse_kommunenummer: { type: "keyword" },
      adressekode: { type: "keyword" },
      bokstav: { type: "keyword" },
      bruksenhetsnummer: { type: "keyword" },
      seksjonsnummer: { type: "integer" },
      gardsnummer: { type: "integer" },
      bruksnummer: { type: "integer" },
      festenummer: { type: "integer" },
      nummer: { type: "integer" },
      stedfestingverifisert: { type: "boolean" },
    },
  },
};
