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
  adresse_id: z.string().nullable(),
  adressetype: z.string().nullable(),
  oppdateringsdato: z.string().nullable(),
  adressetekst: z.string().nullable(),
  adressetekstutenadressetilleggsnavn: z.string().nullable(),
  adressenavn: z.string().nullable(),
  adressetilleggsnavn: z.string().nullable(),
  kortnavn: z.string().nullable(),
  adressekode: z.string().nullable(),
  nummer: z.number().nullable(),
  bokstav: z.string().nullable(),
  bruksenhetsnummer: z.array(z.string()).nullable(),
  kommunenavn: z.string().nullable(),
  kommunenummer: z.string().nullable(),
  postnummer: z.string().nullable(),
  poststed: z.string().nullable(),
  gardsnummer: z.number().nullable(),
  bruksnummer: z.number().nullable(),
  festenummer: z.number().nullable(),
  seksjonsnummer: z.number().nullable(),
  representasjonspunkt: z.object({ lat: z.number(), lon: z.number() }).nullable(),
  representasjonspunkt_stedfesting_verifisert: z.boolean().nullable(),
  atkomstpunkt: z
    .object({
      sommer: z.object({ lat: z.number(), lon: z.number() }).nullable(),
      vinter: z.object({ lat: z.number(), lon: z.number() }).nullable(),
      generell: z.object({ lat: z.number(), lon: z.number() }).nullable(),
    })
    .nullable(),
  "@version": z.string(),
  "@timestamp": z.string(),
});

export type ElasticAddressDocument = z.infer<typeof ElasticAddressDocumentSchema>;
