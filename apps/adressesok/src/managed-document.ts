import type { ElasticAddressDocument } from "@matrikkel/shared-schema";
import type { AddressDocument } from "./elasticsearch";

/**
 * Oversetter et dokument fra den nye ES9-klyngen (`ElasticAddressDocument`,
 * der feltnavn følger Databricks-kontrakten) til API-ets `AddressDocument`-
 * form, som serialiseres av `utils/response.ts`.
 */
export function convertManagedDocument(document: ElasticAddressDocument): AddressDocument {
  const adressekode =
    document.adressekode === null || document.adressekode === ""
      ? null
      : Number(document.adressekode);

  return {
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
  if (!utc) return utc;
  const date = new Date(/(Z|[+-]\d{2}:?\d{2})$/.test(utc) ? utc : `${utc.replace(" ", "T")}Z`);
  const p = Object.fromEntries(norskTid.formatToParts(date).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}
