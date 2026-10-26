import type { estypes } from "@elastic/elasticsearch";
import {
  type ElasticAddressDocument,
  ElasticAddressDocumentSchema,
} from "@matrikkel/shared-schema";
import { z } from "zod";

/**
 * Raden slik den kommer fra Databricks-tabellen. Én flat tabell dekker
 * både vegadresse og matrikkeladresse.
 *
 * Feltnavn og -typer følger datakontrakten (`matrikkel_adressesok_produkt_gold`,
 * id `7bf75945-6f2b-4f62-bfda-d6e52ba81c2d`, kontraktet
 * `eiendom_matrikkelen-adresse.3_gold_schema`) rått - ingen oversettelse til
 * hovedappens eldre feltnavn skjer her. Den oversettelsen (f.eks.
 * `uuid`→`lokalid`, `adressetype`→`objtype`) gjøres i stedet av søke-APIet
 * (`adressesok`) for å unngå et samtidig brudd der.
 *
 * `representasjonspunkt`/`atkomstpunkt`/`bruksenhetsnummer` valideres
 * her slik at ugyldige kildeverdier stopper lastingen.
 */
const PointSchema = z.object({ lat: z.number(), lon: z.number() });

export const DatabricksRowSchema = z
  .object({
    uuid: z.string().min(1),
    adresse_id: z.number(),
    adressetype: z.string(),
    oppdateringsdato: z.string(),
    adressetekst: z.string(),
    adressetekstutenadressetilleggsnavn: z.string(),
    adressenavn: z.string().nullable(),
    adressetilleggsnavn: z.string().nullable(),
    kortnavn: z.string().nullable(),
    adressekode: z.string().nullable(),
    nummer: z.number().nullable(),
    bokstav: z.string().nullable(),
    bruksenhetsnummer: z.array(z.string()),
    kommunenavn: z.string(),
    kommunenummer: z.string(),
    postnummer: z.string(),
    poststed: z.string(),
    gardsnummer: z.number(),
    bruksnummer: z.number(),
    festenummer: z.number(),
    seksjonsnummer: z.number(),
    undernummer: z.number().nullable(),
    representasjonspunkt: PointSchema,
    representasjonspunkt_stedfesting_verifisert: z.boolean(),
    atkomstpunkt: z.object({
      sommer: PointSchema.nullable(),
      vinter: PointSchema.nullable(),
      generell: PointSchema.nullable(),
    }),
  })
  .strict();

export type DatabricksRow = z.infer<typeof DatabricksRowSchema>;

/**
 * Kolonner vi henter fra Databricks-tabellen, i den rekkefølgen de velges
 * ut i SQL-spørringen. Typet mot `DatabricksRow` slik at en feilstavet
 * kolonne feiler på kompileringstidspunktet.
 */
export const COLUMNS: ReadonlyArray<keyof DatabricksRow> = [
  "uuid",
  "adresse_id",
  "adressetype",
  "oppdateringsdato",
  "adressetekst",
  "adressetekstutenadressetilleggsnavn",
  "adressenavn",
  "adressetilleggsnavn",
  "kortnavn",
  "adressekode",
  "nummer",
  "bokstav",
  "bruksenhetsnummer",
  "kommunenavn",
  "kommunenummer",
  "postnummer",
  "poststed",
  "gardsnummer",
  "bruksnummer",
  "festenummer",
  "seksjonsnummer",
  "undernummer",
  "representasjonspunkt",
  "representasjonspunkt_stedfesting_verifisert",
  "atkomstpunkt",
];

/**
 * Dokumentet slik det ligger i Elasticsearch. Dette *er* modellen som
 * publiseres - selve definisjonen (`ElasticAddressDocumentSchema`) ligger i
 * `@matrikkel/shared-schema` slik at `adressesok` (søke-APIet) kan ta den i
 * bruk direkte når den migrerer bort fra sin eldre `AddressDocument`
 * (`lokalid`, `objtype`, `adresse_kommunenummer`, `stedfestingverifisert`,
 * ...) - inntil da lever de to modellene side om side. Speiler `MAPPING`
 * under. `rowToDocument` er eneste sted som bygger disse.
 */
export type AddressDocument = ElasticAddressDocument;

export function rowToDocument(row: DatabricksRow, timestamp: string): AddressDocument {
  if (row.uuid == null || row.uuid === "") {
    throw new Error("Databricks-rad mangler uuid");
  }

  const source = DatabricksRowSchema.safeParse(row);
  if (!source.success) {
    throw new Error(`Ugyldig Databricks-rad for uuid ${row.uuid}: ${source.error.message}`, {
      cause: source.error,
    });
  }

  const result = ElasticAddressDocumentSchema.strict().safeParse({
    ...source.data,
    adresse_id: String(source.data.adresse_id),
    bruksenhetsnummer: source.data.bruksenhetsnummer.filter((number) => number !== ""),
    "@version": "2",
    "@timestamp": timestamp,
  });
  if (!result.success) {
    throw new Error(`Ugyldig dokument for uuid ${row.uuid}: ${result.error.message}`, {
      cause: result.error,
    });
  }
  return result.data;
}

// Speiler produksjonsindeksen: stemmet felt med `.exact` (kun lowercase)
const norskTekst: estypes.MappingProperty = {
  type: "text",
  analyzer: "norwegian",
  fields: { exact: { type: "text", analyzer: "norwegian_exact" } },
};

// `adressetekst*` er i produksjon uten egen analysator (standard)
const standardTekst: estypes.MappingProperty = { type: "text" };

/**
 * `dynamic: strict` gjør at en ny kolonne i databasen feiler synlig
 * istedenfor å bli indeksert som noe tilfeldig.
 */
export const MAPPING: Pick<estypes.IndicesCreateRequest, "settings" | "mappings"> = {
  settings: {
    index: { number_of_shards: 1, number_of_replicas: 0, refresh_interval: "-1" },
    analysis: {
      analyzer: {
        // Kopi av analysatorene i produksjonsklyngen (index template
        // `adressesok`), uten asciifolding
        norwegian: {
          type: "custom",
          tokenizer: "standard",
          filter: ["lowercase", "norwegian_stop", "norwegian_keywords", "norwegian_stemmer"],
        },
        norwegian_exact: {
          type: "custom",
          tokenizer: "standard",
          filter: ["lowercase"],
        },
      },
      filter: {
        norwegian_stop: { type: "stop", stopwords: "_norwegian_" },
        norwegian_keywords: { type: "keyword_marker", keywords: ["eksempel"] },
        norwegian_stemmer: { type: "stemmer", language: "norwegian" },
      },
    },
  },
  mappings: {
    dynamic: "strict",
    properties: {
      "@timestamp": { type: "date" },
      "@version": { type: "keyword" },
      uuid: { type: "keyword" },
      adresse_id: { type: "keyword" },
      adressetype: { type: "keyword" },
      oppdateringsdato: {
        type: "date",
        // Godtar både ISO-tidspunkter og Databricks-format med mellomrom.
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
      adressetekst: standardTekst,
      adressetekstutenadressetilleggsnavn: standardTekst,
      adressetilleggsnavn: norskTekst,
      adressenavn: norskTekst,
      kortnavn: norskTekst,
      kommunenavn: norskTekst,
      poststed: norskTekst,
      postnummer: { type: "keyword" },
      kommunenummer: { type: "keyword" },
      adressekode: { type: "keyword" },
      bokstav: { type: "keyword" },
      bruksenhetsnummer: { type: "keyword" },
      seksjonsnummer: { type: "integer" },
      undernummer: { type: "integer" },
      gardsnummer: { type: "integer" },
      bruksnummer: { type: "integer" },
      festenummer: { type: "integer" },
      nummer: { type: "integer" },
      representasjonspunkt_stedfesting_verifisert: { type: "boolean" },
    },
  },
};
