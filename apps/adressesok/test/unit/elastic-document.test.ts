import { describe, expect, test } from "bun:test";
import type { ElasticAddressDocument } from "@matrikkel/shared-schema";
import { convertElasticDocument } from "../../src/elastic-document";

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
  undernummer: null,
  representasjonspunkt: point,
  representasjonspunkt_stedfesting_verifisert: true,
  atkomstpunkt: {
    oy: point,
    nodetat: null,
    sommer: point,
    vinter: point,
    generell: point,
  },
  "@version": "2",
  "@timestamp": "2024-05-01T12:34:56.789Z",
};

describe("convertElasticDocument", () => {
  test("mapper nytt skjema til den eldre AddressDocument-formen", () => {
    expect(convertElasticDocument(document)).toMatchObject({
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

  test("sender undernummer videre for matrikkeladresse", () => {
    expect(
      convertElasticDocument({ ...document, adressetype: "Matrikkeladresse", undernummer: 2 })
        .undernummer,
    ).toBe(2);
  });

  test("gjør oppdateringsdato om fra UTC til norsk lokaltid", () => {
    const convert = (oppdateringsdato: string) =>
      convertElasticDocument({ ...document, oppdateringsdato }).oppdateringsdato;

    expect(convert("2024-05-01T12:34:56.789Z")).toBe("2024-05-01T14:34:56");
    expect(convert("2024-01-15T12:34:56.789Z")).toBe("2024-01-15T13:34:56");
    expect(convert("2024-05-01T23:30:00Z")).toBe("2024-05-02T01:30:00");
  });

  test("behandler tom/null adressekode som null", () => {
    expect(convertElasticDocument({ ...document, adressekode: "" }).adressekode).toBeNull();
    expect(convertElasticDocument({ ...document, adressekode: null }).adressekode).toBeNull();
  });

  test("viser manglende bokstav som tom streng for vegadresse og null for matrikkeladresse", () => {
    expect(convertElasticDocument({ ...document, bokstav: null }).bokstav).toBe("");
    expect(convertElasticDocument({ ...document, bokstav: "" }).bokstav).toBe("");
    expect(
      convertElasticDocument({ ...document, adressetype: "Matrikkeladresse", bokstav: null })
        .bokstav,
    ).toBeNull();
  });

  test("viser bruksenhetsnummer bare når det er flere bruksenheter", () => {
    expect(
      convertElasticDocument({ ...document, bruksenhetsnummer: [] }).bruksenhetsnummer,
    ).toEqual([]);
    expect(convertElasticDocument(document).bruksenhetsnummer).toEqual([]);
    expect(
      convertElasticDocument({ ...document, bruksenhetsnummer: ["H0101", "H0201"] })
        .bruksenhetsnummer,
    ).toEqual(["H0101", "H0201"]);
  });
});
