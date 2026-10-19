import { z } from "zod";

const PointShapeSchema = z
  .object({
    lat: z.number(),
    lon: z.number(),
  })
  .nullable();

export const PointSchema = PointShapeSchema;

/**
 * `atkomstpunkt` modellert etter kodelista `TypeAtkomst` (produktspek.
 * kap. 5.1.2.17) - sommer/vinter/generell-varianter av samme adkomstpunkt.
 * Nesten alltid null i praksis.
 */
const AtkomstpunktShapeSchema = z
  .object({
    sommer: PointShapeSchema.optional(),
    vinter: PointShapeSchema.optional(),
    generell: PointShapeSchema.optional(),
  })
  .nullable()
  .transform((atkomstpunkt) =>
    atkomstpunkt == null
      ? null
      : {
          sommer: atkomstpunkt.sommer ?? null,
          vinter: atkomstpunkt.vinter ?? null,
          generell: atkomstpunkt.generell ?? null,
        },
  );

export const AtkomstpunktSchema = AtkomstpunktShapeSchema;

/**
 * En array med bruksenhetsnummer, f.eks. `["H0101","H0102"]` - noen ganger
 * med tomme strenger iblandet, som ikke er reelle bruksenhetsnummer og
 * filtreres bort. Tom etter filtrering (eller manglende) blir `null`.
 */
const BruksenhetsnummerShapeSchema = z
  .array(z.string())
  .nullable()
  .transform((arr) => {
    if (arr == null) return null;
    const filtered = arr.filter((v) => v !== "");
    return filtered.length > 0 ? filtered : null;
  });

export const BruksenhetsnummerSchema = BruksenhetsnummerShapeSchema;
