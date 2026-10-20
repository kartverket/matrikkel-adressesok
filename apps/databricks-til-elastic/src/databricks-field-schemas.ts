import { z } from "zod";

const PointShapeSchema = z
  .object({
    lat: z.number(),
    lon: z.number(),
  })
  .nullable();

export const PointSchema = PointShapeSchema;

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

const BruksenhetsnummerShapeSchema = z
  .array(z.string())
  .nullable()
  .transform((arr) => {
    if (arr == null) return null;
    const filtered = arr.filter((v) => v !== "");
    return filtered.length > 0 ? filtered : null;
  });

export const BruksenhetsnummerSchema = BruksenhetsnummerShapeSchema;
