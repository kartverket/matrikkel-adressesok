import { describe, expect, it } from "bun:test";
import type { DatabricksRow } from "../../src/schema";
import { rowToDocument } from "../../src/transform";

const TS = "2026-09-02T10:00:00.000Z";

// EPSG:4258 (grader), slik Databricks leverer koordinatene - ca. Oslo
// sentrum.
const LON = 10.75;
const LAT = 59.91;

const BASE: DatabricksRow = {
  uuid: "12345",
  adresse_id: 98765,
  adressetype: "Vegadresse",
  oppdateringsdato: "2024-05-01T12:34:56.789Z",
  adressetilleggsnavn: null,
  kortnavn: "Storgata",
  kommunenavn: "Oslo",
  postnummer: "0155",
  poststed: "OSLO",
  kommunenummer: "0301",
  gardsnummer: null,
  bruksnummer: null,
  festenummer: null,
  seksjonsnummer: 0,
  representasjonspunkt_stedfesting_verifisert: true,
  adressetekst: "Storgata 1",
  adressetekstutenadressetilleggsnavn: "Storgata 1",
  bruksenhetsnummer: ["H0101", "H0102"],
  adressekode: null,
  bokstav: null,
  adressenavn: "Storgata",
  nummer: 1,
  atkomstpunkt: null,
  representasjonspunkt: { lat: LAT, lon: LON },
};

const row = (overrides: Partial<DatabricksRow> = {}): DatabricksRow => ({ ...BASE, ...overrides });

describe("rowToDocument", () => {
  it("tolker representasjonspunkt uten reprojeksjon (allerede EPSG:4258)", () => {
    const doc = rowToDocument(row(), TS);
    expect(doc.representasjonspunkt?.lat).toBe(LAT);
    expect(doc.representasjonspunkt?.lon).toBe(LON);
  });

  it("beholder null når representasjonspunkt mangler", () => {
    expect(rowToDocument(row({ representasjonspunkt: null }), TS).representasjonspunkt).toBeNull();
  });

  it("stopper ved ugyldige feltverdier i stedet for å indeksere null", () => {
    for (const [felt, verdi] of [
      ["representasjonspunkt", JSON.stringify({ lat: LAT, lon: LON })],
      ["atkomstpunkt", JSON.stringify({ generell: { lat: LAT, lon: LON } })],
      ["bruksenhetsnummer", JSON.stringify(["H0101"])],
      ["atkomstpunkt", { generell: { lat: "ugyldig", lon: LON } }],
      ["representasjonspunkt", { lat: null, lon: LON }],
      ["representasjonspunkt", { lat: LAT }],
      ["atkomstpunkt", { sommer: { lat: LAT, lon: null } }],
      ["bruksenhetsnummer", [42]],
    ] as const) {
      expect(() => rowToDocument(row({ [felt]: verdi }), TS)).toThrow(
        new RegExp(`Ugyldig dokument for uuid 12345:.*${felt}`, "s"),
      );
    }
  });

  it("stopper også ved ugyldige ordinære felt", () => {
    expect(() => rowToDocument(Object.assign(row(), { postnummer: 1676 }), TS)).toThrow(
      /Ugyldig dokument for uuid 12345:.*postnummer/s,
    );
  });

  it("tolker atkomstpunkt med sommer/vinter/generell-varianter uten reprojeksjon", () => {
    const doc = rowToDocument(
      row({
        atkomstpunkt: {
          sommer: null,
          vinter: null,
          generell: { lat: LAT, lon: LON },
        },
      }),
      TS,
    );
    expect(doc.atkomstpunkt?.sommer).toBeNull();
    expect(doc.atkomstpunkt?.vinter).toBeNull();
    expect(doc.atkomstpunkt?.generell?.lat).toBe(LAT);
    expect(doc.atkomstpunkt?.generell?.lon).toBe(LON);
  });

  it("setter atkomstpunkt til null når feltet mangler", () => {
    const doc = rowToDocument(row({ atkomstpunkt: null }), TS);
    expect(doc.atkomstpunkt).toBeNull();
  });

  it("sender adressetype uendret videre", () => {
    expect(rowToDocument(row({ adressetype: "Vegadresse" }), TS).adressetype).toBe("Vegadresse");
    expect(rowToDocument(row({ adressetype: "Matrikkeladresse" }), TS).adressetype).toBe(
      "Matrikkeladresse",
    );
  });

  it("tolker bruksenhetsnummer-arrayen og filtrerer bort tomme strenger", () => {
    const doc = rowToDocument(row({ bruksenhetsnummer: ["", "H0101", "H0201"] }), TS);
    expect(doc.bruksenhetsnummer).toEqual(["H0101", "H0201"]);
  });

  it("setter bruksenhetsnummer til null når arrayen er tom eller mangler", () => {
    expect(rowToDocument(row({ bruksenhetsnummer: [""] }), TS).bruksenhetsnummer).toBeNull();
    expect(rowToDocument(row({ bruksenhetsnummer: null }), TS).bruksenhetsnummer).toBeNull();
  });

  it("sender oppdateringsdato uendret videre", () => {
    const doc = rowToDocument(row(), TS);
    expect(doc.oppdateringsdato).toBe("2024-05-01T12:34:56.789Z");
  });

  it("sender adressekode uendret videre", () => {
    const doc = rowToDocument(row({ adressekode: "00042" }), TS);
    expect(doc.adressekode).toBe("00042");
  });

  it("bruker uuid uendret og adresse_id som streng", () => {
    const doc = rowToDocument(row({ uuid: "42", adresse_id: 7 }), TS);
    expect(doc.uuid).toBe("42");
    expect(doc.adresse_id).toBe("7");
  });

  it("setter adresse_id til null når det mangler", () => {
    const doc = rowToDocument(row({ adresse_id: null }), TS);
    expect(doc.adresse_id).toBeNull();
  });

  it("setter @version og @timestamp", () => {
    const doc = rowToDocument(row(), TS);
    expect(doc["@version"]).toBe("2");
    expect(doc["@timestamp"]).toBe(TS);
  });

  it("stopper lastingen for rader uten uuid", () => {
    expect(() => rowToDocument(row({ uuid: null }), TS)).toThrow("Databricks-rad mangler uuid");
    expect(() => rowToDocument(row({ uuid: "" }), TS)).toThrow("Databricks-rad mangler uuid");
  });

  it("beholder øvrige felt uendret", () => {
    const doc = rowToDocument(row({ postnummer: "0155", gardsnummer: 7 }), TS);
    expect(doc.postnummer).toBe("0155");
    expect(doc.gardsnummer).toBe(7);
    expect(doc.adressetekst).toBe("Storgata 1");
    expect(doc.kortnavn).toBe("Storgata");
    expect(doc.seksjonsnummer).toBe(0);
  });
});
