# Matrikkel address API — Bun/Hono

## Requirements

- Bun 1.3 or newer
- Docker with Compose for the isolated Elasticsearch integration tests

## Configuration

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `ELS_ADRESSER_URL` | no | — | Legacy Elasticsearch 7 URL. Not used by the API (see Search backend) |
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

## Search backend

`/sok` and `/punktsok` query the Elasticsearch 9 cluster (`ES_URL`/`ES_API_KEY`, alias chosen by
`ENVIRONMENT`), and `/internal/isReady` depends on that cluster. The index uses the field names in
`@matrikkel/shared-schema`'s `ElasticAddressDocument`, and `undernummer` can be used as a search
parameter. `oppdateringsdato` is stored in UTC and returned as Norwegian local time without a time zone.

The old Elasticsearch 7 implementation (`ElasticsearchClient`, `constructGeneralQuery` and the
`ELS_ADRESSER_*` configuration) is kept in the code base but is no longer wired to any route.

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