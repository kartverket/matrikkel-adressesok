import { z } from "zod";

const optionalEnvironmentVariable = z
  .string()
  .optional()
  .transform((value) => value || undefined);

const EnvironmentSchema = z
  .object({
    ELS_ADRESSER_URL: z.url(),
    ELS_ADRESSER_USERNAME: optionalEnvironmentVariable,
    ELS_ADRESSER_PASSWORD: optionalEnvironmentVariable,
    ELS_ADRESSER_INDEX: z.string().default("adressesok"),
    ELS_ADRESSER_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),
    PORT: z.coerce.number().int().positive().default(3000),
    ADRESSER_API_LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  })
  .refine(
    ({ ELS_ADRESSER_USERNAME, ELS_ADRESSER_PASSWORD }) =>
      (ELS_ADRESSER_USERNAME === undefined) === (ELS_ADRESSER_PASSWORD === undefined),
    {
      message: "ELS_ADRESSER_USERNAME and ELS_ADRESSER_PASSWORD must be provided together",
    },
  );

export type AppConfig = ReturnType<typeof loadConfig>;

export function loadConfig(env: Record<string, string | undefined> = Bun.env) {
  const parsed = EnvironmentSchema.parse({
    ...env,
    ADRESSER_API_LOG_LEVEL: env.ADRESSER_API_LOG_LEVEL?.toLowerCase(),
  });

  return {
    elasticSearch: {
      url: parsed.ELS_ADRESSER_URL.replace(/\/$/, ""),
      username: parsed.ELS_ADRESSER_USERNAME,
      password: parsed.ELS_ADRESSER_PASSWORD,
      index: parsed.ELS_ADRESSER_INDEX,
      requestTimeout: parsed.ELS_ADRESSER_TIMEOUT_MS,
    },
    port: parsed.PORT,
    logLevel: parsed.ADRESSER_API_LOG_LEVEL,
  };
}
