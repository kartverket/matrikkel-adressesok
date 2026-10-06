# databricks-til-elastic

Laster matrikkeladresser fra Databricks til Elasticsearch.

Konsumentene leser aldri en indeks direkte, bare gjennom aliaset
`ed_adressesok`. Jobben bygger en ny indeks ved siden av og flytter aliaset
til slutt:

```
1. Opprett ny indeks    ed_adressesok_v1-20260902104500   (alias uberørt)
2. Last inn alt         refresh_interval=-1, replicas=0    (alias uberørt)
3. Slå på refresh og replicas                              (alias uberørt)
4. Fornuftssjekk: antall dokumenter og avvik mot gammel     (alias uberørt)
5. Bytt alias i ett atomisk kall
6. Slett gamle indekser aliaset ikke lenger peker på
```

Feiler noe i steg 1–4, står aliaset urørt på gammel indeks og trafikken er
upåvirket. Den halvferdige indeksen ligger igjen for feilsøking. Steg 6
rydder bare opp indekser som akkurat ble byttet bort fra alias i steg 5 -
feiler oppryddingen, logges det som en advarsel, men jobben regnes likevel
som vellykket siden aliaset allerede peker riktig.

Jobben gjør ingen massering av dataene underveis - tabellen i Databricks
velges rett ut og sendes til Elasticsearch slik den ligger, bortsett fra det
`transform.ts` må gjøre for at ES skal godta formen (geo_point, `lokalid`
som streng).

## Kjøring

```bash
bun install
docker compose up -d
cp .env.example .env
bun start
```

[.env.example](.env.example) peker på det lokale testmiljøet med
`DATABRICKS_MOCK=true`, så dette fungerer uten tilgang til et ekte
Databricks-warehouse. Bun laster `.env` automatisk.

| Kommando | |
|---|---|
| `bun start` | Full kjøring mot `DATABRICKS_HOST`/`DATABRICKS_TABLE` |
| `bun run start:mock` | Full kjøring mot faste rader i [dev/fixtures](dev/fixtures), ingen Databricks-tilgang nødvendig |
| `bun run reset` | Ren tavle lokalt: slett indekser, importer fixtures på nytt |
| `bun run es:reset` | Bare slett indeksene som matcher prefikset |
| `bun test` / `bun run test` | Enhetstester (`test/unit`) - ingen I/O, trenger ikke docker compose |
| `bun run test:integration` | Kjører hele jobben (`runLoad`) mot ekte Elasticsearch i docker compose (`test/integration`) |
| `bun run compose:up` | Starter Elasticsearch i bakgrunnen (`localhost:9201`), venter til den er klar |
| `bun run compose:down` | Stopper og fjerner Elasticsearch-containeren og volumet |
| `bun run typecheck` | `tsc --noEmit` |

`reset`-kommandoene er kun for det lokale testmiljøet — de peker på
`localhost:9201` og containeren fra docker compose.

## Konfigurasjon

```bash
DATABRICKS_HOST='******.cloud.databricks.com'
DATABRICKS_HTTP_PATH='/sql/1.0/warehouses/****************'
DATABRICKS_TOKEN='dapi********************************'
DATABRICKS_TABLE='catalog.skjema.matrikkel_adresse'
ES_URL='******rib-ap0210:9200'
ES_API_KEY='****************'
TZ=UTC
```

`ES_API_KEY` er valgfri - utelatt lokalt siden docker-compose-clusteret kjører
uten sikkerhet (`xpack.security.enabled: false`), men påkrevd i produksjon.

`DATABRICKS_MOCK=true` bytter Databricks-kilden ut med faste rader fra
[dev/fixtures](dev/fixtures) - de fire variablene over trengs da ikke. Satt i
`.env.example` for lokal bruk, skal ikke være satt i produksjon.

`INDEX_SUFFIX` legges til alias- og indeksnavnet (f.eks. `-prodtest`), slik at
jobben kan kjøre mot samme ES-cluster fra flere miljøer uten at de overskriver
hverandres indekser/alias. Ubrukt i prod.

Feltnavn og kodelister følger [produktspesifikasjon Matrikkelen-Adresse
20200501](https://register.geonorge.no/data/documents/Produktspesifikasjoner_matrikkelen-adresse_v2_produktspesifikasjon-matrikkelen-adresse-20200501_.pdf).
`atkomstpunkt` er modellert etter kodelista `TypeAtkomst` (kap. 5.1.2.17).

Retry, batching av bulk-kall og ny-forsøk på 429-avviste dokumenter kommer
fra `@elastic/elasticsearch`. Strømming med konstant minnebruk kommer fra
`@databricks/sql` sin `iterateRows`, som henter resultatet i porsjoner på
`BATCH_SIZE` rader. Ikke reimplementer det.

## Lokalt testmiljø

`docker compose up -d` gir Elasticsearch på 9201. Det kobles ikke mot noe
ekte Databricks-warehouse lokalt - kjør med `DATABRICKS_MOCK=true` (satt i
`.env.example`), så leser jobben i stedet 1 079 faste rader fra
[dev/fixtures/matrikkel_adresse.json](dev/fixtures/matrikkel_adresse.json),
nok til å passere `MIN_DOCS`-sjekken i [check.ts](src/check.ts). Fixturen
inneholder begge adressetyper og noen vrange rader (manglende `lokalid`,
manglende koordinater, begge atkomstpunkt-variantene) for å øve på
feilhåndteringen.

På Apple Silicon med en x86_64 Docker-VM faller Elasticsearch-JVM-en ofte
med `exit code 134` (SIGSEGV i JIT-kompilert kode). Den starter iblant hvis
du prøver på nytt:

```bash
docker compose down -v && docker compose up -d
```

Får du den ikke opp, pek `ES_URL` mot et remote dev-cluster i stedet. Å slå
av JIT (`-XX:TieredStopAtLevel=0`) fjerner krasjen, men gjør oppstarten så
langsom at den ikke blir ferdig.

## Integrasjonstester

[test/integration/kjor-lasting.test.ts](test/integration/kjor-lasting.test.ts)
kjører hele jobben (`runLoad` fra [runner.ts](src/runner.ts)) mot en ekte
Elasticsearch, med `DATABRICKS_MOCK=true` og fixturene i
[dev/fixtures](dev/fixtures) som kilde. Den setter `INDEX_SUFFIX` til noe
unikt per kjøring (basert på `Date.now()`) slik at testen ikke kolliderer med
indekser/alias fra `bun start`/`bun run reset` i samme cluster, og rydder opp
etter seg i `afterAll`.

```bash
bun run compose:up
bun run test:integration
bun run compose:down
```

Siden `config.ts`/`elastic.ts` leser miljøvariabler ved import, setter testen
`process.env` *før* den dynamisk importerer dem (`await import(...)`) - et
vanlig top-level `import` ville kjørt før miljøvariablene var satt. Samme
mønster bør brukes om det kommer flere integrasjonstester som trenger egne
miljøvariabler/isolasjon.

Enhetstestene i [test/unit](test/unit) trenger ikke docker compose - de
tester rene funksjoner (`transform.ts`, `check.ts`) uten I/O.

## Kjøring på SKIP

Jobben kjører som en periodisk `SKIPJob` i to miljøer, se
[.skip/prod.yaml](.skip/prod.yaml) (hver natt kl. 03:00 UTC) og
[.skip/prodtest.yaml](.skip/prodtest.yaml) (hver time, `INDEX_SUFFIX=-prodtest`
så den ikke rører prod sitt alias/indekser) og [SKIP sin dokumentasjon om
jobber](https://skip.kartverket.no/docs/jobber-skip). Hemmeligheter
(`DATABRICKS_TOKEN` m.fl.) kommer inn via `envFrom`/secret, ikke som literal
`env` i manifestet.

For å trigge en kjøring manuelt (uten å vente til neste cron-tidspunkt): gå
inn i Argo CD, finn CronJob-ressursen, kebab-meny → "Create Job". Det kjører
jobben umiddelbart med samme image/config som den periodiske kjøringen.

Bygges og rulles ut av
[.github/workflows/databricks-til-elastic-build-push-deploy.yaml](../.github/workflows/databricks-til-elastic-build-push-deploy.yaml)
ved push til `main` som rører `databricks-til-elastic/**`, delte
`packages/**`, rot-`package.json`/`bun.lock` eller selve workflow-filen:
typecheck + enhetstester + integrasjonstester (mot Elasticsearch i docker
compose) → bygg og push image til `ghcr.io` →
[Pharos](https://github.com/kartverket/pharos) sårbarhetsskann → deploy til
prodtest via `heimdall-deploy` → deploy til prod, bak et GitHub Environment
(`production`) slik at det kan kreve godkjenning.

## Ikke implementert ennå

- Retry mot Databricks (Elasticsearch-siden retryer selv)
- Kontrollert avbrudd på SIGTERM
- Flere fornuftssjekker: obligatoriske felt, geo-søk, søk på `adressetekst`
- Dry-run
