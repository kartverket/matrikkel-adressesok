# matrikkel-adressesok

Monorepo med Matrikkelens adressesøk-tjenester.

## Struktur

```
apps/
  adressesok/              Matrikkel address API (Bun/Hono)
  databricks-til-elastic/  SKIPJob som laster matrikkeladresser fra Databricks til Elasticsearch
packages/
  shared-logging/          Delt logging-oppsett
  shared-schema/           Delte typer/skjema
```

Se README i hver app-mappe for app-spesifikk dokumentasjon, oppsett og kommandoer.

## Felles verktøy

Fra repo-roten:

```bash
bun install        # installerer alle workspaces
bun run format      # biome format
bun run lint        # biome lint
```

`compose.yaml` i roten starter en lokal Elasticsearch for `apps/adressesok` sine
integrasjonstester (se `apps/adressesok/package.json` for `compose:up`/`compose:down`).
