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
    oppdateringsdato: document.oppdateringsdato,
  };
}
