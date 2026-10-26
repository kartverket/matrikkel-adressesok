import { z } from "zod";

/**
 * Modellen for adressedokumentet slik `databricks-til-elastic` publiserer
 * det til Elasticsearch - feltnavn følger Databricks-kontrakten rått
 * (`uuid`, `adresse_id`, `adressetype`, `kommunenummer`,
 * `representasjonspunkt_stedfesting_verifisert`, ...), ikke hovedappens
 * eldre `AddressDocument`-kontrakt (`lokalid`, `objtype`,
 * `adresse_kommunenummer`, `stedfestingverifisert`, ...).
 *
 * Deles her slik at `adressesok` (søke-APIet) kan ta den i bruk direkte når
 * den migrerer bort fra de eldre feltnavnene - inntil da lever de to
 * modellene side om side, og `databricks-til-elastic` er eneste konsument.
 *
 * Dette er *dokumentets* skjema, altså den ferdig tolkede formen som
 * faktisk ligger i Elasticsearch, ikke Databricks-raden før validering.
 */
export const ElasticAddressDocumentSchema = z.object({
  uuid: z.string(),
  adresse_id: z.string(),
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
  representasjonspunkt: z.object({ lat: z.number(), lon: z.number() }),
  representasjonspunkt_stedfesting_verifisert: z.boolean(),
  atkomstpunkt: z.object({
    sommer: z.object({ lat: z.number(), lon: z.number() }).nullable(),
    vinter: z.object({ lat: z.number(), lon: z.number() }).nullable(),
    generell: z.object({ lat: z.number(), lon: z.number() }).nullable(),
  }),
  "@version": z.string(),
  "@timestamp": z.string(),
});

export type ElasticAddressDocument = z.infer<typeof ElasticAddressDocumentSchema>;
