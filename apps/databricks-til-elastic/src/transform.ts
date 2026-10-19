import { ElasticAddressDocumentSchema } from "@matrikkel/shared-schema";
import {
  AtkomstpunktSchema,
  BruksenhetsnummerSchema,
  PointSchema,
} from "./databricks-field-schemas";
import type { AddressDocument, DatabricksRow } from "./schema";

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
