import { describe, expect, it } from "bun:test";
import { type DatabricksRow, rowToDocument } from "../../src/schema";

const timestamp = "2026-09-02T10:00:00.000Z";
const point = { lat: 59.91, lon: 10.75 };
const base: DatabricksRow = {
  uuid: "12345",
  adresse_id: 98765,
  adressetype: "Vegadresse",
  oppdateringsdato: "2024-05-01T12:34:56.789Z",
  adressetekst: "Storgata 1",
  adressetekstutenadressetilleggsnavn: "Storgata 1",
  adressenavn: "Storgata",
  adressetilleggsnavn: "",
  kortnavn: "Storgata",
  adressekode: "",
  nummer: 1,
  bokstav: null,
  bruksenhetsnummer: ["", "H0101"],
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
    atkomstOy: point,
    AtkomstNodetat: null,
    sommer: point,
    vinter: point,
    generell: point,
  },
};

describe("rowToDocument", () => {
  it("mapper rad og beholder null for nummer og bokstav", () => {
    const document = rowToDocument({ ...base, nummer: null, bokstav: null }, timestamp);
    expect(document.adresse_id).toBe("98765");
    expect(document.nummer).toBeNull();
    expect(document.bokstav).toBeNull();
    expect(document.bruksenhetsnummer).toEqual(["H0101"]);
    expect(document.representasjonspunkt).toEqual(point);
    expect(document.atkomstpunkt).toEqual(base.atkomstpunkt);
    expect(document["@timestamp"]).toBe(timestamp);
  });

  it("beholder undernummer for matrikkeladresse og null for vegadresse", () => {
    expect(rowToDocument({ ...base, undernummer: 2 }, timestamp).undernummer).toBe(2);
    expect(rowToDocument(base, timestamp).undernummer).toBeNull();
  });

  it("beholder null for sommer og vinter og et gyldig generelt punkt", () => {
    const atkomstpunkt = {
      atkomstOy: null,
      AtkomstNodetat: point,
      sommer: null,
      vinter: null,
      generell: point,
    };
    expect(rowToDocument({ ...base, atkomstpunkt }, timestamp).atkomstpunkt).toEqual(atkomstpunkt);
  });

  it("beholder null for adressenavn, kortnavn, adressekode, adressetilleggsnavn og atkomstpunkt.generell", () => {
    const atkomstpunkt = {
      atkomstOy: null,
      AtkomstNodetat: null,
      sommer: null,
      vinter: null,
      generell: null,
    };
    const document = rowToDocument(
      {
        ...base,
        adressenavn: null,
        kortnavn: null,
        adressekode: null,
        adressetilleggsnavn: null,
        atkomstpunkt,
      },
      timestamp,
    );
    expect(document.adressenavn).toBeNull();
    expect(document.kortnavn).toBeNull();
    expect(document.adressekode).toBeNull();
    expect(document.adressetilleggsnavn).toBeNull();
    expect(document.atkomstpunkt).toEqual(atkomstpunkt);
  });

  it("godtar tomme strenger og tom liste, men ikke null", () => {
    expect(
      rowToDocument({ ...base, bruksenhetsnummer: [""] }, timestamp).bruksenhetsnummer,
    ).toEqual([]);
    for (const field of [
      "adresse_id",
      "adressetekst",
      "bruksenhetsnummer",
      "representasjonspunkt",
      "atkomstpunkt",
      "gardsnummer",
    ] as const) {
      const invalid = Object.assign({}, base, { [field]: null });
      expect(() => rowToDocument(invalid, timestamp)).toThrow(
        new RegExp(`Ugyldig Databricks-rad.*${field}`, "s"),
      );
    }
  });

  it("avviser ufullstendige og ugyldige nestede punkter", () => {
    for (const value of [
      { generell: point },
      { sommer: point, vinter: point, generell: point },
      { sommer: point, vinter: point, generell: { lat: null, lon: 10.75 } },
      { sommer: { lat: null, lon: 10.75 }, vinter: point, generell: point },
    ]) {
      const invalid = Object.assign({}, base, { atkomstpunkt: value });
      expect(() => rowToDocument(invalid as DatabricksRow, timestamp)).toThrow(
        /Ugyldig Databricks-rad.*atkomstpunkt/s,
      );
    }
  });

  it("stopper på manglende uuid og uventede kolonner", () => {
    expect(() => rowToDocument({ ...base, uuid: "" }, timestamp)).toThrow(
      "Databricks-rad mangler uuid",
    );
    const extraColumn = { ...base, ekstra: 42 };
    expect(() => rowToDocument(extraColumn, timestamp)).toThrow(/Ugyldig Databricks-rad/);
  });
});
