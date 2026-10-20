# databricks-til-elastic

Laster matrikkeladresser fra Databricks til Elasticsearch.

Konsumentene leser aldri en indeks direkte, bare gjennom aliaset
`ed_adressesok`. Jobben bygger en ny indeks ved siden av og flytter aliaset
til slutt:

```
1. Tell rader i Databricks                                (alias uberørt)
2. Opprett ny indeks    ed_adressesok_v1-20260902104500   (alias uberørt)
3. Last inn alt         refresh_interval=-1, replicas=0    (alias uberørt)
4. Slå på refresh og replicas                              (alias uberørt)
5. Fornuftssjekk: antall dokumenter og avvik mot gammel    (alias uberørt)
6. Bytt alias i ett atomisk kall
7. Slett jobbens egne indekser eldre enn 48 timer som ikke har noe alias
```

Feiler noe i steg 1–5, står aliaset urørt på gammel indeks og trafikken er
upåvirket. Feil etter opprettelsen lar den halvferdige indeksen ligge igjen
for feilsøking. Steg 7 rydder bare opp indekser med jobbens navnemønster
som er minst 48 timer gamle og ikke har noe alias. Navn med andre miljøsuffikser
eller ugyldig tidsstempel blir ikke slettet. Feiler oppryddingen, logges det
som en advarsel, men jobben regnes likevel som vellykket siden aliaset
allerede peker riktig.

`transform.ts` mapper og validerer hele dokumentet før indeksering.
`representasjonspunkt` og `atkomstpunkt` forventes som objekter, og
`bruksenhetsnummer` som array fra driveren.

`runner.ts` teller først radene i kildetabellen og logger fremdrift for hver
5 prosent mens dokumentene lastes. Feiler tellingen, stoppes jobben før
indeksen opprettes. Databricks-radene leses strømmet med
`iterateRows()` i porsjoner på `ROWS_PER_BATCH_FROM_DATABRICKS`.
Elasticsearch-skrivingen bruker `helpers.bulk()` med `concurrency: 1` og
standardgrensen på 5 MB per forespørsel.

## Kjøring

```bash
bun install
bun run compose:up
cp .env.example .env
bun start
```

[.env.example](.env.example) peker på det lokale testmiljøet med
`DATABRICKS_MOCK=true` og placeholder-verdier for de påkrevde
Databricks-variablene (brukes ikke reelt i mock-modus), så dette fungerer
uten tilgang til et ekte Databricks-warehouse. Bun laster `.env` automatisk.

| Kommando | |
|---|---|
| `bun start` | Full kjøring mot `DATABRICKS_HOST`/`DATABRICKS_TABLE` |
| `bun run start:mock` | Full kjøring mot faste rader i [dev/fixtures](dev/fixtures), ingen Databricks-tilgang nødvendig |
| `bun run reset` | Ren tavle lokalt: slett indekser, importer fixtures på nytt |
| `bun run es:reset` | Bare slett indeksene som matcher prefikset |
| `bun run test` | Enhetstester (`test/unit`) - ingen I/O, trenger ikke docker compose |
| `bun run test:integration` | Kjører hele jobben (`runLoad`) mot ekte Elasticsearch i docker compose (`test/integration`) |
| `bun run compose:up` | Starter Elasticsearch i bakgrunnen (`localhost:9201`), venter til den er klar |
| `bun run compose:down` | Stopper og fjerner Elasticsearch-containeren og volumet |
| `bun run typecheck` | `tsc --noEmit` |

`reset`-kommandoene er kun for det lokale testmiljøet — de peker på
`localhost:9201` og containeren fra docker compose.

## Konfigurasjon

```bash
DATABRICKS_HOST='3359340685875444.4.gcp.databricks.com'
DATABRICKS_HTTP_PATH='/sql/1.0/warehouses/7b7b34fd5e55d6f1'
DATABRICKS_CLIENT_ID='****************'
DATABRICKS_CLIENT_SECRET='****************'
DATABRICKS_TABLE='matrikkel_adressesok_produkt'
ES_URL='******rib-ap0210:9200'
ES_API_KEY='****************'
TZ=UTC
```

`DATABRICKS_HOST`, `DATABRICKS_HTTP_PATH` og `DATABRICKS_TABLE` er ikke
hemmeligheter og står derfor i klartekst i [.skip/prod.yaml](.skip/prod.yaml)
og [.skip/prodtest.yaml](.skip/prodtest.yaml) (prodtest leser samme tabell med
`_prodtest`-suffiks: `matrikkel_adressesok_produkt_prodtest`).

`DATABRICKS_CLIENT_ID`/`DATABRICKS_CLIENT_SECRET` er OAuth-legitimasjonen
(client credentials / M2M) til en Databricks-service principal - opprettet
via [Datamarkedsplass sin "kom i gang"-guide](https://datamarkedsplass.kartverket-intern.cloud/kom-i-gang).
`@databricks/sql` henter selv access token fra
`https://<DATABRICKS_HOST>/oidc/v1/token` og fornyer det automatisk når det
utløper; scope er alltid `all-apis` for M2M-flyten, det er ikke
konfigurerbart. Personal access token (`DATABRICKS_TOKEN`) er ikke lenger
støttet.

`ES_API_KEY` er valgfri - utelatt lokalt siden docker-compose-clusteret kjører
uten sikkerhet (`xpack.security.enabled: false`), men påkrevd i produksjon.

`DATABRICKS_MOCK=true` bytter Databricks-kilden ut med faste rader fra
[dev/fixtures](dev/fixtures) via en falsk `@databricks/sql`-klient (se
[src/databricks.mock.ts](src/databricks.mock.ts)) - resten av kjeden
(spørringsbygging, radtransformasjon, feillogging) er nøyaktig den samme
koden som mot et ekte warehouse. De fem Databricks-variablene over leses og
valideres fortsatt, men brukes ikke reelt i mock-modus; `bun run start:mock`
setter derfor harmløse placeholder-verdier for dem automatisk.

`INDEX_SUFFIX` legges til alias- og indeksnavnet (f.eks. `-prodtest`), slik at
jobben kan kjøre mot samme ES-cluster fra flere miljøer uten at de overskriver
hverandres indekser/alias. Ubrukt i prod.

Feltnavn og kodelister følger [produktspesifikasjon Matrikkelen-Adresse
20200501](https://register.geonorge.no/data/documents/Produktspesifikasjoner_matrikkelen-adresse_v2_produktspesifikasjon-matrikkelen-adresse-20200501_.pdf).
`atkomstpunkt` er modellert etter kodelista `TypeAtkomst` (kap. 5.1.2.17).

## Datamodell

Databricks-tabellen sender noen felt i et format som ikke kan lagres direkte
i Elasticsearch, og `transform.ts` gjør derfor denne valideringen/tolkningen
før indeksering (se [src/schema.ts](src/schema.ts) for selve typene og
[src/transform.ts](src/transform.ts) for logikken):

Dokumentmodellen som publiseres til Elasticsearch (`AddressDocument` i
[src/schema.ts](src/schema.ts)) er et typealias for `ElasticAddressDocument` i
[@matrikkel/shared-schema](../../packages/shared-schema/src/elastic-address-document.ts)
- den er delt dit med vilje, slik at `adressesok` (søke-APIet) kan ta den
samme modellen i bruk direkte når den migrerer bort fra sin eldre
`AddressDocument` (`lokalid`, `objtype`, `adresse_kommunenummer`,
`stedfestingverifisert`, ...). Inntil den migreringen skjer lever de to
modellene side om side, og denne jobben er eneste konsument av den nye.

`DatabricksRow` (samme fil) er bevisst en egen, separat kontrakt - ikke
samme type som `AddressDocument`/`ElasticAddressDocument`, selv om feltene i
stor grad er like i dag. Det gjør det mulig å endre Databricks-siden
(expand/contract på selve kildekontrakten) uten at det automatisk
forplanter seg til Elasticsearch-dokumentet med en gang. `rowToDocument()` i
[src/transform.ts](src/transform.ts) er den eksplisitte (foreløpig nokså
tynne) mappingen mellom de to.

Feltnavnene i Elasticsearch følger Databricks sine rå kolonnenavn
(`uuid`, `adresse_id`, `adressetype`, `kommunenummer`,
`representasjonspunkt_stedfesting_verifisert`, ...) direkte - denne jobben
gjør ingen oversettelse til hovedappens eldre feltnavn. Den oversettelsen
gjøres i stedet av søke-APIet, for å unngå et samtidig brudd der.

- **Koordinater** (`representasjonspunkt` og `atkomstpunkt`) har lat/lon
  allerede i EPSG:4258 (grader) - samme SRID som hovedappens søke-API
  forventer, så de lagres uendret som `geo_point`. De valideres med
  `PointSchema`/`AtkomstpunktSchema` fra
  [src/databricks-field-schemas.ts](src/databricks-field-schemas.ts), som
  forventer objekter fra Databricks. Eksplisitt `null` betyr at punktet
  mangler; delvise punkter og ugyldige verdier stopper lastingen før aliaset
  byttes.
- **`bruksenhetsnummer`** valideres med `BruksenhetsnummerSchema` på samme
  måte (forventer en array, f.eks. `["H0101","H0102"]`,
  noen ganger med tomme strenger iblandet). Tomme strenger filtreres bort,
  og matcher da hovedappens `AddressDocument.bruksenhetsnummer`.
- **`adressetype`** kommer som `"Vegadresse"`/`"Matrikkeladresse"`
  og videreføres uendret.
- **`adresse_id`, `kortnavn`, `seksjonsnummer`** lagres og indekseres, men
  finnes ikke i hovedappens `AddressDocument` og eksponeres derfor ikke av
  søke-APIet.
- **`adressekode`** er 100 % `null` i alle data vi har sett så langt - typen
  er derfor fortsatt en lokal overstyring (`string | null`) av hovedappens
  `number | null` inntil vi vet mer om den reelle typen.

Retry, batching av bulk-kall og ny-forsøk på 429-avviste dokumenter kommer
fra `@elastic/elasticsearch`. Strømming med konstant minnebruk kommer fra
`@databricks/sql` sin `iterateRows`, som henter resultatet i porsjoner på
`ROWS_PER_BATCH_FROM_DATABRICKS` rader. Ikke reimplementer det.

## Lokalt testmiljø

`bun run compose:up` gir Elasticsearch på 9201. Det kobles ikke mot noe
ekte Databricks-warehouse lokalt - kjør med `DATABRICKS_MOCK=true` (satt i
`.env.example`), så leser jobben i stedet 1 081 faste rader fra
[dev/fixtures/matrikkel_adresse.json](dev/fixtures/matrikkel_adresse.json),
nok til å passere antallssjekken i [check.ts](src/check.ts). Fixturen
inneholder begge adressetyper, nullverdier, begge atkomstpunkt-variantene
og et `bruksenhetsnummer` med tom streng iblandet.

På Apple Silicon med en x86_64 Docker-VM faller Elasticsearch-JVM-en ofte
med `exit code 134` (SIGSEGV i JIT-kompilert kode). Den starter iblant hvis
du prøver på nytt:

```bash
bun run compose:down && bun run compose:up
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
(`DATABRICKS_CLIENT_SECRET` m.fl.) kommer inn via `envFrom`/secret, ikke som
literal `env` i manifestet.

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
- Parallelle Databricks-spørringer mot partisjonerte rad-utvalg (flere
  samtidige `iterateRows`-strømmer) - vurder først om større
  `ROWS_PER_BATCH_FROM_DATABRICKS` alene løser ytelsesbehovet, siden
  partisjonering legger til vesentlig kompleksitet (flere sesjoner,
  sammenslåing av fremdriftstelling, osv.)
