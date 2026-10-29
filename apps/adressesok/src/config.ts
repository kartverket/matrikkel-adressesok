import { z } from "zod";

const optionalEnvironmentVariable = z
  .string()
  .optional()
  .transform((value) => value || undefined);

const EnvironmentSchema = z
  .object({
    ES_URL: z.url(),
    ES_API_KEY: optionalEnvironmentVariable,
    ENVIRONMENT: z.enum(["DEVELOPMENT", "PRODTEST", "PROD"]).default("DEVELOPMENT"),
    INTEGRATION_TEST_ID: optionalEnvironmentVariable,
    PORT: z.coerce.number().int().positive().default(3000),
    ADRESSER_API_LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  })
  .refine(
    ({ ENVIRONMENT, INTEGRATION_TEST_ID }) =>
      INTEGRATION_TEST_ID === undefined ||
      (ENVIRONMENT === "DEVELOPMENT" && /^[a-z0-9]+$/.test(INTEGRATION_TEST_ID)),
    {
      message: "INTEGRATION_TEST_ID can only be alphanumeric and used in DEVELOPMENT",
    },
  );

export type AppConfig = ReturnType<typeof loadConfig>;

export function loadConfig(env: Record<string, string | undefined> = Bun.env) {
  const parsed = EnvironmentSchema.parse({
    ...env,
    ADRESSER_API_LOG_LEVEL: env.ADRESSER_API_LOG_LEVEL?.toLowerCase(),
  });
  const testSuffix = parsed.INTEGRATION_TEST_ID ? `-test-${parsed.INTEGRATION_TEST_ID}` : "";

  return {
    elasticsearch: {
      url: parsed.ES_URL,
      apiKey: parsed.ES_API_KEY,
      alias:
        parsed.ENVIRONMENT === "PROD"
          ? "ed_adressesok"
          : `ed_adressesok-${parsed.ENVIRONMENT.toLowerCase()}${testSuffix}`,
    },
    port: parsed.PORT,
    logLevel: parsed.ADRESSER_API_LOG_LEVEL,
  };
}
