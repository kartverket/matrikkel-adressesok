import { describe, expect, it } from "bun:test";
import type { DatabricksRow } from "../../src/schema";
import { rowToDocument } from "../../src/transform";

const TS = "2026-09-02T10:00:00.000Z";

const BASE: DatabricksRow = {
  lokalid: 12345,
  objtype: "Vegadresse",
  oppdateringsdato: "2024-05-01 12:34:56.789",
  representasjonspunkt_lon: 10.75,
  representasjonspunkt_lat: 59.91,
  adressetilleggsnavn: null,
  kommunenavn: "Oslo",
  postnummer: "0155",
  poststed: "OSLO",
  adresse_kommunenummer: "0301",
  gardsnummer: null,
  bruksnummer: null,
  festenummer: null,
  stedfestingverifisert: true,
  adressetekst: "Storgata 1",
  adressetekstutenadressetilleggsnavn: "Storgata 1",
  bruksenhetsnummer: "H0101,H0102",
  undernummer: null,
  adressekode: null,
  bokstav: null,
  adressenavn: "Storgata",
  nummer: 1,
};

const row = (overrides: Partial<DatabricksRow> = {}): DatabricksRow => ({ ...BASE, ...overrides });

function rowToDocumentExpectedNotNull(row: DatabricksRow, timestamp: string) {
  const doc = rowToDocument(row, timestamp);
  if (doc === null) throw new Error("forventet dokument, fikk null");
  return doc;
}

describe("rowToDocument", () => {
  it("slår lat/lon sammen til geo_point og fjerner kildefeltene", () => {
    const doc = rowToDocumentExpectedNotNull(row(), TS);
    expect(doc.representasjonspunkt).toEqual({ lat: 59.91, lon: 10.75 });
    expect(doc).not.toHaveProperty("representasjonspunkt_lat");
    expect(doc).not.toHaveProperty("representasjonspunkt_lon");
  });

  it("utelater punktet når koordinatene mangler", () => {
    const doc = rowToDocumentExpectedNotNull(row({ representasjonspunkt_lat: null }), TS);
    expect(doc.representasjonspunkt).toBeNull();
  });

  it("sender oppdateringsdato uendret videre", () => {
    const doc = rowToDocumentExpectedNotNull(row(), TS);
    expect(doc.oppdateringsdato).toBe("2024-05-01 12:34:56.789");
  });

  it("sender bruksenhetsnummer uendret videre", () => {
    const doc = rowToDocumentExpectedNotNull(row(), TS);
    expect(doc.bruksenhetsnummer).toBe("H0101,H0102");
  });

  it("sender adressekode uendret videre", () => {
    const doc = rowToDocumentExpectedNotNull(row({ adressekode: "00042" }), TS);
    expect(doc.adressekode).toBe("00042");
  });

  it("bruker lokalid som streng", () => {
    const doc = rowToDocumentExpectedNotNull(row({ lokalid: 42 }), TS);
    expect(doc.lokalid).toBe("42");
  });

  it("setter @version og @timestamp", () => {
    const doc = rowToDocumentExpectedNotNull(row(), TS);
    expect(doc["@version"]).toBe("2");
    expect(doc["@timestamp"]).toBe(TS);
  });

  it("returnerer null for rader uten lokalid", () => {
    expect(rowToDocument(row({ lokalid: null }), TS)).toBeNull();
    expect(rowToDocument(row({ lokalid: "" }), TS)).toBeNull();
  });

  it("beholder øvrige felt uendret", () => {
    const doc = rowToDocumentExpectedNotNull(row({ postnummer: "0155", gardsnummer: 7 }), TS);
    expect(doc.postnummer).toBe("0155");
    expect(doc.gardsnummer).toBe(7);
    expect(doc.adressetekst).toBe("Storgata 1");
  });
});
