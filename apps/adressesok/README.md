# Matrikkel adresse-API — Bun/Hono

## Krav

- Bun 1.4 eller nyere

## Konfigurasjon

| Variabel | Påkrevd | Standard | Formål |
| --- | --- | --- | --- |
| `ES_URL` | ja | — | URL til Elasticsearch |
| `ES_API_KEY` | nei | — | API-nøkkel for clusteret |
| `ENVIRONMENT` | nei | `DEVELOPMENT` | Miljø for alias: `DEVELOPMENT`, `PRODTEST` eller `PROD` |
| `INTEGRATION_TEST_ID` | nei | — | Testsuffiks for aliaset (kun med `DEVELOPMENT`) |
| `ADRESSER_API_LOG_LEVEL` | nei | `info` | `debug`, `info`, `warn` eller `error` |
| `PORT` | nei | `3000` | HTTP-port |

Kopier `.env.example` til `.env.local`, eller sett variablene i shellet. Bun leser `.env.local` automatisk.

## Indeks

Indeksen bruker egne feltnavn (`ElasticAddressDocument` i `@matrikkel/shared-schema`),
og `undernummer` er indeksert og kan brukes som søkeparameter.

## Kjør lokalt

Kjør kommandoene under fra denne mappen (`apps/adressesok`):

```bash
bun install
bun run dev
```

## Tester

Kjør formatering/lint, streng TypeScript-kompilering og enhetstester:

```bash
# Kjør biome, typesjekk og enhetstester
bun run check

# Kjør enhetstester
bun run test
```
