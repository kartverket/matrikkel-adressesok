# Matrikkel address API — Bun/Hono

## Requirements

- Bun 1.3 or newer
- Docker with Compose for the isolated Elasticsearch integration tests

## Configuration

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `ELS_ADRESSER_URL` | yes | — | Single load-balanced Elasticsearch URL |
| `ELS_ADRESSER_USERNAME` | no | — | Elasticsearch basic-auth username |
| `ELS_ADRESSER_PASSWORD` | no | — | Elasticsearch basic-auth password |
| `ELS_ADRESSER_INDEX` | no | `adressesok` | Elasticsearch index |
| `ELS_ADRESSER_TIMEOUT_MS` | no | `20000` | Elasticsearch request timeout |
| `ES_URL` | yes | — | URL for the new Elasticsearch 9 cluster |
| `ES_API_KEY` | no | — | API key for the new cluster |
| `ENVIRONMENT` | no | `DEVELOPMENT` | ES9 alias environment: `DEVELOPMENT`, `PRODTEST` or `PROD` |
| `INTEGRATION_TEST_ID` | no | — | Test suffix for ES9 alias (only with `DEVELOPMENT`) |
| `ADRESSER_API_LOG_LEVEL` | no | `ERROR` | `DEBUG`, `INFO`, `WARN`, or `ERROR` |
| `PORT` | no | `3000` | HTTP listen port |

Copy `.env.example` to `.env.local` or export the variables in your shell. Bun loads `.env.local` automatically.

## Internal comparison endpoints

`/adresser/v1/internal/sok` and `/adresser/v1/internal/punktsok` mirror `/sok` and `/punktsok`,
but query the new Elasticsearch 9 cluster (`ES_URL`/`ES_API_KEY`) instead of the legacy cluster
(`ELS_ADRESSER_URL`). They reuse the same validation, pagination, projection, and JSON response
shape, so results can be diffed 1:1 against `/sok`/`/punktsok` while migrating. They are internal
(not part of the public OpenAPI docs) and do not affect today's `/sok`/`/punktsok` flow.

The ES9 index uses different field names (`@matrikkel/shared-schema`'s `ElasticAddressDocument`),
but `undernummer` is indexed and can be used as a search parameter on these endpoints.

## Run locally

Kjør kommandoene under fra denne mappen (`apps/adressesok`):

```bash
bun install
bun run dev
```

## Tests

Run formatting/lint checks, strict TypeScript compilation, and unit tests:

```bash
# Run biome, typechecking and unit tests
bun run check

# Run unit tests
bun run test

# Run integration tests (requires docker compose for elasticsearch, see "compose:up" and "compose:down" scripts)
bun run test:integration
```