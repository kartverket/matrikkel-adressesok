import type { AddressDocument, ElasticAddressDocument } from "@matrikkel/shared-schema";

/**
 * Oversetter et dokument fra Elasticsearch (`ElasticAddressDocument`,
 * der feltnavn følger Databricks-kontrakten) til API-ets `AddressDocument`-
 * form, som serialiseres av `utils/response.ts`.
 */
export function convertElasticDocument(document: ElasticAddressDocument): AddressDocument {
  const adressekode =
    document.adressekode === null || document.adressekode === ""
      ? null
      : Number(document.adressekode);

  return {
    adresseid: document.adresse_id,
    adressenavn: document.adressenavn,
    adressetekst: document.adressetekst,
    adressetilleggsnavn: document.adressetilleggsnavn,
    adressekode: adressekode !== null && Number.isFinite(adressekode) ? adressekode : null,
    nummer: document.nummer,
    bokstav: document.adressetype === "Vegadresse" ? (document.bokstav ?? "") : document.bokstav,
    adresse_kommunenummer: document.kommunenummer,
    kommunenummer: document.kommunenummer,
    kommunenavn: document.kommunenavn,
    gardsnummer: document.gardsnummer,
    bruksnummer: document.bruksnummer,
    festenummer: document.festenummer,
    undernummer: document.undernummer,
    bruksenhetsnummer: document.bruksenhetsnummer.length === 1 ? [] : document.bruksenhetsnummer,
    objtype: (document.adressetype ?? null) as "Matrikkeladresse" | "Vegadresse" | null,
    poststed: document.poststed,
    postnummer: document.postnummer,
    adressetekstutenadressetilleggsnavn: document.adressetekstutenadressetilleggsnavn,
    stedfestingverifisert: document.representasjonspunkt_stedfesting_verifisert,
    representasjonspunkt: document.representasjonspunkt,
    oppdateringsdato: tilNorskTid(document.oppdateringsdato),
    atkomstpunkt: document.atkomstpunkt,
  };
}

const norskTid = new Intl.DateTimeFormat("nb-NO", {
  timeZone: "Europe/Oslo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** Indeksen har UTC, mens dagens API svarer med norsk tid uten tidssone, f.eks. 2024-05-01T14:34:56. */
function tilNorskTid(utc: string): string {
  const p = Object.fromEntries(norskTid.formatToParts(new Date(utc)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}
