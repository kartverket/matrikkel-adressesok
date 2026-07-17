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
| `ADRESSER_API_LOG_LEVEL` | no | `ERROR` | `DEBUG`, `INFO`, `WARN`, or `ERROR` |
| `PORT` | no | `3000` | HTTP listen port |

Copy `.env.example` to `.env.local` or export the variables in your shell. Bun loads `.env.local` automatically.

## Run locally

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

# Run integration tests (starts elasticsearch, and runs tests in an isolated container)
bun run test:compose

# Run integration tests (requires manuallu starting elasticsearch, see "docker:up" and "docker:down" scripts)
bun run test:integration
```