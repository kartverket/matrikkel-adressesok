import { ElasticAddressDocumentSchema } from "@matrikkel/shared-schema";
import { z } from "zod";
import type { AddressDocument, DatabricksRow } from "./schema";

const PointSchema = z.object({ lat: z.number(), lon: z.number() }).nullable();
const AtkomstpunktSchema = z
  .object({
    sommer: PointSchema.optional(),
    vinter: PointSchema.optional(),
    generell: PointSchema.optional(),
  })
  .nullable()
  .transform((point) =>
    point == null
      ? null
      : {
          sommer: point.sommer ?? null,
          vinter: point.vinter ?? null,
          generell: point.generell ?? null,
        },
  );
const BruksenhetsnummerSchema = z
  .array(z.string())
  .nullable()
  .transform((numbers) => {
    if (numbers == null) return null;
    const nonEmpty = numbers.filter((number) => number !== "");
    return nonEmpty.length > 0 ? nonEmpty : null;
  });

const DocumentSchema = ElasticAddressDocumentSchema.extend({
  bruksenhetsnummer: BruksenhetsnummerSchema,
  representasjonspunkt: PointSchema,
  atkomstpunkt: AtkomstpunktSchema,
}).strict();

export function rowToDocument(row: DatabricksRow, timestamp: string): AddressDocument {
  if (row.uuid == null || row.uuid === "") {
    throw new Error("Databricks-rad mangler uuid");
  }

  const result = DocumentSchema.safeParse({
    ...row,
    adresse_id: row.adresse_id == null ? null : String(row.adresse_id),
    "@version": "2",
    "@timestamp": timestamp,
  });

  if (!result.success) {
    throw new Error(`Ugyldig dokument for uuid ${row.uuid}: ${result.error.message}`, {
      cause: result.error,
    });
  }
  return result.data;
}
