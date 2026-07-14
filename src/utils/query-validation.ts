import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { jsonResponse } from "../http";
import { DEFAULT_SRID } from "../projection";

export const integerQuery = z
  .string()
  .regex(/^[+-]?\d+$/, "Not a valid integer.")
  .transform(Number)
  .refine(Number.isSafeInteger, "Not a valid integer.");

export const numberQuery = z
  .string()
  .min(1, "Not a valid number.")
  .pipe(z.coerce.number({ error: "Not a valid number." }));

export const booleanQuery = z.stringbool({
  truthy: ["true", "1", "yes", "y", "on"],
  falsy: ["false", "0", "no", "n", "off"],
});

export const standardParameters = {
  filtrer: z.string().optional(),
  utkoordsys: integerQuery.optional().default(DEFAULT_SRID),
  treffPerSide: integerQuery
    .optional()
    .default(10)
    .refine((value) => value <= 1000, "Antallet treff per side er satt for høyt."),
  side: integerQuery.optional().default(0),
  asciiKompatibel: booleanQuery.optional().default(true),
};

export function enforcePaginationLimit(
  parameters: { treffPerSide: number; side: number },
  context: z.RefinementCtx,
): void {
  if (parameters.treffPerSide * (parameters.side + 1) > 10_000) {
    context.addIssue({
      code: "custom",
      path: ["side"],
      message:
        "Api-et returner ikke mer enn de første 10 000 treffene. Men datasettet kan lastes ned i sin helhet fra Geonorge.no .",
    });
  }
}

export function formatValidationErrors(
  error: Pick<z.core.$ZodError, "issues">,
): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    recordValidationIssue(errors, issue);
  }
  return errors;
}

function addValidationMessage(
  errors: Record<string, string[]>,
  field: string,
  message: string,
): void {
  const messages = errors[field];
  if (messages) {
    messages.push(message);
    return;
  }
  errors[field] = [message];
}

function recordValidationIssue(errors: Record<string, string[]>, issue: z.core.$ZodIssue): void {
  if (issue.code === "unrecognized_keys") {
    for (const key of issue.keys) {
      addValidationMessage(errors, key, "Unknown field.");
    }
    return;
  }

  const field = String(issue.path[0] ?? "_schema");
  if (issue.code === "invalid_type" && issue.input === undefined) {
    addValidationMessage(errors, field, "Missing data for required field.");
    return;
  }
  addValidationMessage(errors, field, issue.message);
}

export const validateQuery = <T extends z.ZodType>(schema: T) =>
  zValidator("query", schema, (result, _context) => {
    if (result.success) return;

    return jsonResponse({ message: formatValidationErrors(result.error) }, 400, true);
  });
