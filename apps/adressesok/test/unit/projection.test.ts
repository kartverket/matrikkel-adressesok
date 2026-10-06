import { describe, expect, test } from "bun:test";
import { reprojectAddresses, reprojectInputToDefault } from "../../src/projection";

describe("PROJ coordinate conversion", () => {
  test("converts ETRS89 to UTM 33 using longitude/latitude ordering", () => {
    const [address] = reprojectAddresses(
      [
        {
          representasjonspunkt: {
            epsg: "EPSG:4258",
            lat: 60.145187,
            lon: 10.2497,
          },
        },
      ],
      25833,
    );
    expect(address?.representasjonspunkt?.lat).toBeCloseTo(6677067.5, 0);
    expect(address?.representasjonspunkt?.lon).toBeCloseTo(236353.7, 0);
    expect(address?.representasjonspunkt?.epsg).toBe("EPSG:25833");
  });

  test("converts UTM input back to the default CRS", () => {
    const point = reprojectInputToDefault(6676920.57, 236323.24, 25833);
    expect(point.lat).toBeCloseTo(60.1438528, 5);
    expect(point.lon).toBeCloseTo(10.249344, 5);
  });
});
