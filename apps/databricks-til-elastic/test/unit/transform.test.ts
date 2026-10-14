import { describe, expect, it } from "bun:test";
import type { DatabricksRow } from "../../src/schema";
import { rowToDocument } from "../../src/transform";

const TS = "2026-09-02T10:00:00.000Z";

// EPSG:4258 (grader), slik Databricks leverer koordinatene - ca. Oslo
// sentrum.
const LON = 10.75;
const LAT = 59.91;

const BASE: DatabricksRow = {
  lokalid: 12345,
  adresseid: 98765,
  objid: "obj-98765",
  objtype: "vegadresse",
  oppdateringsdato: "2024-05-01 12:34:56.789",
  adressetilleggsnavn: null,
  kortnavn: "Storgata",
  kommunenavn: "Oslo",
  postnummer: "0155",
  poststed: "OSLO",
  adresse_kommunenummer: "0301",
  gardsnummer: null,
  bruksnummer: null,
  festenummer: null,
  seksjonsnummer: 0,
  stedfestingverifisert: true,
  adressetekst: "Storgata 1",
  adressetekstutenadressetilleggsnavn: "Storgata 1",
  bruksenhetsnummer: `["H0101","H0102"]`,
  adressekode: null,
  bokstav: null,
  adressenavn: "Storgata",
  nummer: 1,
  atkomstpunkt: null,
  representasjonspunkt: JSON.stringify({ lat: LAT, lon: LON }),
};

const row = (overrides: Partial<DatabricksRow> = {}): DatabricksRow => ({ ...BASE, ...overrides });

function rowToDocumentExpectedNotNull(row: DatabricksRow, timestamp: string) {
  const doc = rowToDocument(row, timestamp);
  if (doc === null) throw new Error("forventet dokument, fikk null");
  return doc;
}

describe("rowToDocument", () => {
  it("tolker representasjonspunkt-JSON-en uten reprojeksjon (allerede EPSG:4258)", () => {
    const doc = rowToDocumentExpectedNotNull(row(), TS);
    expect(doc.representasjonspunkt?.lat).toBe(LAT);
    expect(doc.representasjonspunkt?.lon).toBe(LON);
  });

  it("utelater punktet når representasjonspunkt mangler eller ikke lar seg tolke", () => {
    expect(
      rowToDocumentExpectedNotNull(row({ representasjonspunkt: null }), TS).representasjonspunkt,
    ).toBeNull();
    expect(
      rowToDocumentExpectedNotNull(row({ representasjonspunkt: "ikke json" }), TS)
        .representasjonspunkt,
    ).toBeNull();
    expect(
      rowToDocumentExpectedNotNull(
        row({ representasjonspunkt: JSON.stringify({ lat: null, lon: LON }) }),
        TS,
      ).representasjonspunkt,
    ).toBeNull();
  });

  it("tolker atkomstpunkt med sommer/vinter/generell-varianter uten reprojeksjon", () => {
    const doc = rowToDocumentExpectedNotNull(
      row({
        atkomstpunkt: JSON.stringify({
          sommer: null,
          vinter: null,
          generell: { lat: LAT, lon: LON },
        }),
      }),
      TS,
    );
    expect(doc.atkomstpunkt?.sommer).toBeNull();
    expect(doc.atkomstpunkt?.vinter).toBeNull();
    expect(doc.atkomstpunkt?.generell?.lat).toBe(LAT);
    expect(doc.atkomstpunkt?.generell?.lon).toBe(LON);
  });

  it("setter atkomstpunkt til null når feltet mangler", () => {
    const doc = rowToDocumentExpectedNotNull(row({ atkomstpunkt: null }), TS);
    expect(doc.atkomstpunkt).toBeNull();
  });

  it("normaliserer lowercase objtype til hovedappens kapitaliserte form", () => {
    expect(rowToDocumentExpectedNotNull(row({ objtype: "vegadresse" }), TS).objtype).toBe(
      "Vegadresse",
    );
    expect(rowToDocumentExpectedNotNull(row({ objtype: "matrikkeladresse" }), TS).objtype).toBe(
      "Matrikkeladresse",
    );
  });

  it("setter objtype til null for ukjente verdier", () => {
    const doc = rowToDocumentExpectedNotNull(
      row({ objtype: "ukjent" as DatabricksRow["objtype"] }),
      TS,
    );
    expect(doc.objtype).toBeNull();
  });

  it("tolker bruksenhetsnummer-JSON-arrayen og filtrerer bort tomme strenger", () => {
    const doc = rowToDocumentExpectedNotNull(
      row({ bruksenhetsnummer: `["","H0101","H0201"]` }),
      TS,
    );
    expect(doc.bruksenhetsnummer).toEqual(["H0101", "H0201"]);
  });

  it("setter bruksenhetsnummer til null når arrayen er tom eller mangler", () => {
    expect(
      rowToDocumentExpectedNotNull(row({ bruksenhetsnummer: `[""]` }), TS).bruksenhetsnummer,
    ).toBeNull();
    expect(
      rowToDocumentExpectedNotNull(row({ bruksenhetsnummer: null }), TS).bruksenhetsnummer,
    ).toBeNull();
  });

  it("sender oppdateringsdato uendret videre", () => {
    const doc = rowToDocumentExpectedNotNull(row(), TS);
    expect(doc.oppdateringsdato).toBe("2024-05-01 12:34:56.789");
  });

  it("sender adressekode uendret videre", () => {
    const doc = rowToDocumentExpectedNotNull(row({ adressekode: "00042" }), TS);
    expect(doc.adressekode).toBe("00042");
  });

  it("bruker lokalid og adresseid som streng", () => {
    const doc = rowToDocumentExpectedNotNull(row({ lokalid: 42, adresseid: 7 }), TS);
    expect(doc.lokalid).toBe("42");
    expect(doc.adresseid).toBe("7");
  });

  it("setter adresseid til null når det mangler", () => {
    const doc = rowToDocumentExpectedNotNull(row({ adresseid: null }), TS);
    expect(doc.adresseid).toBeNull();
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
    expect(doc.kortnavn).toBe("Storgata");
    expect(doc.objid).toBe("obj-98765");
    expect(doc.seksjonsnummer).toBe(0);
  });
});
