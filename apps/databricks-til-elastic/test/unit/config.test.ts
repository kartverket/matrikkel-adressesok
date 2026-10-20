import { describe, expect, it } from "bun:test";
import { Environment, indexSuffixForEnvironment, parseEnvironment } from "../../src/config";

describe("indexSuffixForEnvironment", () => {
  it("inkluderer miljøet i indeksnavnet", () => {
    expect(indexSuffixForEnvironment(Environment.PROD)).toBe("-prod");
    expect(indexSuffixForEnvironment(Environment.PRODTEST)).toBe("-prodtest");
    expect(indexSuffixForEnvironment(Environment.DEVELOPMENT)).toBe("-development");
  });

  it("avviser ukjente miljøer", () => {
    for (const environment of ["", "Prod", "prod_test", "prod*", "test", "development"]) {
      expect(() => parseEnvironment(environment)).toThrow(/Ugyldig ENVIRONMENT/);
    }
  });
});
