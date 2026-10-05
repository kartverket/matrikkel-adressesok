import { describe, expect, it } from "bun:test";
import { assertHealthy, type Counts, relativtAvvikProsent } from "../../src/check";

const sunn: Counts = {
  antallGodkjentAvBulkHelper: 5000,
  antallAvvistAvElasticsearch: 0,
  antallDokumenterINyIndeks: 5000,
  antallDokumenterIForrigeIndeks: 4900,
};

describe("relativtAvvikProsent", () => {
  it("regner ut relativt avvik", () => {
    expect(relativtAvvikProsent(110, 100)).toBeCloseTo(10);
    expect(relativtAvvikProsent(90, 100)).toBeCloseTo(10);
    expect(relativtAvvikProsent(100, 100)).toBe(0);
  });

  it("håndterer tomt utgangspunkt", () => {
    expect(relativtAvvikProsent(0, 0)).toBe(0);
    expect(relativtAvvikProsent(5, 0)).toBe(100);
  });
});

describe("assertHealthy", () => {
  it("slipper gjennom en rimelig indeks", () => {
    expect(() => assertHealthy(sunn)).not.toThrow();
  });

  it("stopper på avviste dokumenter", () => {
    expect(() => assertHealthy({ ...sunn, antallAvvistAvElasticsearch: 1 })).toThrow(
      "1 dokumenter ble avvist",
    );
  });

  it("stopper når indeksen mangler dokumenter vi tror vi sendte", () => {
    expect(() => assertHealthy({ ...sunn, antallDokumenterINyIndeks: 4999 })).toThrow(
      "indeksen har 4999 dokumenter, forventet 5000",
    );
  });

  it("stopper på for få dokumenter", () => {
    expect(() =>
      assertHealthy({
        antallGodkjentAvBulkHelper: 999,
        antallAvvistAvElasticsearch: 0,
        antallDokumenterINyIndeks: 999,
        antallDokumenterIForrigeIndeks: 990,
      }),
    ).toThrow("bare 999 dokumenter, forventet minst 1000");
  });

  it("stopper på for stor diff mot gammel indeks", () => {
    expect(() =>
      assertHealthy({
        antallGodkjentAvBulkHelper: 2300,
        antallAvvistAvElasticsearch: 0,
        antallDokumenterINyIndeks: 2300,
        antallDokumenterIForrigeIndeks: 5500,
      }),
    ).toThrow("58.2 % avvik fra gammel indeks");
  });

  it("godtar diff innenfor grensen", () => {
    expect(() => assertHealthy({ ...sunn, antallDokumenterIForrigeIndeks: 4600 })).not.toThrow();
  });

  it("hopper over diff-sjekken på første kjøring", () => {
    expect(() => assertHealthy({ ...sunn, antallDokumenterIForrigeIndeks: 0 })).not.toThrow();
  });
});
