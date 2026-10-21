import { describe, expect, test } from "bun:test";
import type { ElasticAddressDocument } from "@matrikkel/shared-schema";
import { convertManagedDocument } from "../../src/managed-document";

const point = { lat: 59.91, lon: 10.75 };

const document: ElasticAddressDocument = {
  uuid: "12345",
  adresse_id: "98765",
  adressetype: "Vegadresse",
  oppdateringsdato: "2024-05-01T12:34:56.789Z",
  adressetekst: "Storgata 1",
  adressetekstutenadressetilleggsnavn: "Storgata 1",
  adressenavn: "Storgata",
  adressetilleggsnavn: null,
  kortnavn: "Storgata",
  adressekode: "1234",
  nummer: 1,
  bokstav: "A",
  bruksenhetsnummer: ["H0101"],
  kommunenavn: "Oslo",
  kommunenummer: "0301",
  postnummer: "0155",
  poststed: "OSLO",
  gardsnummer: 0,
  bruksnummer: 0,
  festenummer: 0,
  seksjonsnummer: 0,
  representasjonspunkt: point,
  representasjonspunkt_stedfesting_verifisert: true,
  atkomstpunkt: { sommer: point, vinter: point, generell: point },
  "@version": "2",
  "@timestamp": "2024-05-01T12:34:56.789Z",
};

describe("convertManagedDocument", () => {
  test("mapper nytt skjema til den eldre AddressDocument-formen", () => {
    expect(convertManagedDocument(document)).toMatchObject({
      adressenavn: "Storgata",
      adressetekst: "Storgata 1",
      adressekode: 1234,
      nummer: 1,
      bokstav: "A",
      adresse_kommunenummer: "0301",
      kommunenummer: "0301",
      objtype: "Vegadresse",
      poststed: "OSLO",
      stedfestingverifisert: true,
      representasjonspunkt: point,
      undernummer: null,
    });
  });

  test("behandler tom/null adressekode som null", () => {
    expect(convertManagedDocument({ ...document, adressekode: "" }).adressekode).toBeNull();
    expect(convertManagedDocument({ ...document, adressekode: null }).adressekode).toBeNull();
  });

  test("mapper manglende bokstav til tom streng som legacy API-et", () => {
    expect(convertManagedDocument({ ...document, bokstav: null }).bokstav).toBe("");
  });
});
