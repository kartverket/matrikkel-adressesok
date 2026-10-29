import { z } from "zod";
import {
  booleanQuery,
  enforcePaginationLimit,
  integerQuery,
  standardParameters,
} from "../utils/query-validation";

export const addressParameters = {
  adressenavn: z.string().optional(),
  adressetekst: z.string().optional(),
  adressetilleggsnavn: z.string().optional(),
  adressekode: integerQuery.optional(),
  nummer: integerQuery.optional(),
  bokstav: z.string().optional(),
  kommunenummer: z.string().optional(),
  kommunenavn: z.string().optional(),
  gardsnummer: integerQuery.optional(),
  bruksnummer: integerQuery.optional(),
  festenummer: integerQuery.optional(),
  undernummer: integerQuery.optional(),
  bruksenhetsnummer: z.string().optional(),
  objtype: z
    .enum(["Matrikkeladresse", "Vegadresse"], {
      error: "Feil i søkeparameter. Gyldige verdier er: ('Matrikkeladresse', 'Vegadresse')",
    })
    .optional(),
  poststed: z.string().optional(),
  postnummer: z.string().optional(),
};

export const GeneralSearchSchema = z
  .strictObject({
    sok: z
      .string()
      .refine((it) => it.trim().split(/\s+/).filter(Boolean).length <= 50, {
        message: `'sok' kan ikke inneholde flere enn 50 ord`,
      })
      .refine((it) => it.length <= 500, { message: `'sok' kan ikke være lengre enn 500 tegn` })
      .optional(),
    fuzzy: booleanQuery.optional().default(false),
    sokemodus: z
      .string()
      .toUpperCase()
      .pipe(
        z.enum(["AND", "OR"], {
          error: "Feil i søkeparameter. Gyldige verdier er: ('AND', 'OR')",
        }),
      )
      .optional(),
    ...addressParameters,
    ...standardParameters,
  })
  .superRefine(enforcePaginationLimit);

export type GeneralSearchParameters = z.output<typeof GeneralSearchSchema>;
