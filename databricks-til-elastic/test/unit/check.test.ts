import { describe, expect, it } from "bun:test";
import { assertHealthy, type Counts, relativeDeviationPercent } from "../../src/check";

const healthy: Counts = {
  acceptedByBulkHelper: 5000,
  rejectedByElasticsearch: 0,
  documentsInNewIndex: 5000,
  documentsInPreviousIndex: 4900,
};

describe("relativeDeviationPercent", () => {
  it("regner ut relativt avvik", () => {
    expect(relativeDeviationPercent(110, 100)).toBeCloseTo(10);
    expect(relativeDeviationPercent(90, 100)).toBeCloseTo(10);
    expect(relativeDeviationPercent(100, 100)).toBe(0);
  });

  it("håndterer tomt utgangspunkt", () => {
    expect(relativeDeviationPercent(0, 0)).toBe(0);
    expect(relativeDeviationPercent(5, 0)).toBe(100);
  });
});

describe("assertHealthy", () => {
  it("slipper gjennom en rimelig indeks", () => {
    expect(() => assertHealthy(healthy)).not.toThrow();
  });

  it("stopper på avviste dokumenter", () => {
    expect(() => assertHealthy({ ...healthy, rejectedByElasticsearch: 1 })).toThrow(
      "1 dokumenter ble avvist",
    );
  });

  it("stopper når indeksen mangler dokumenter vi tror vi sendte", () => {
    expect(() => assertHealthy({ ...healthy, documentsInNewIndex: 4999 })).toThrow(
      "indeksen har 4999 dokumenter, forventet 5000",
    );
  });

  it("stopper på for få dokumenter", () => {
    expect(() =>
      assertHealthy({
        acceptedByBulkHelper: 999,
        rejectedByElasticsearch: 0,
        documentsInNewIndex: 999,
        documentsInPreviousIndex: 990,
      }),
    ).toThrow("bare 999 dokumenter, forventet minst 1000");
  });

  it("stopper på for stor diff mot gammel indeks", () => {
    expect(() =>
      assertHealthy({
        acceptedByBulkHelper: 2300,
        rejectedByElasticsearch: 0,
        documentsInNewIndex: 2300,
        documentsInPreviousIndex: 5500,
      }),
    ).toThrow("58.2 % avvik fra gammel indeks");
  });

  it("godtar diff innenfor grensen", () => {
    expect(() => assertHealthy({ ...healthy, documentsInPreviousIndex: 4600 })).not.toThrow();
  });

  it("hopper over diff-sjekken på første kjøring", () => {
    expect(() => assertHealthy({ ...healthy, documentsInPreviousIndex: 0 })).not.toThrow();
  });
});
