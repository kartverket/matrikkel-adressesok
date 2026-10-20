# databricks-til-elastic

SKIP-jobb som leser matrikkeladresser fra Databricks og publiserer dem til
Elasticsearch. Konsumentene bruker aliaset `ed_adressesok`, ikke et indeksnavn.

## Flyt og opprydding

Jobben teller radene, oppretter en ny indeks, strømmer og indekserer
dokumentene, aktiverer søk og verifiserer antall og avvik fra forrige indeks.
Først når kontrollene er bestått, byttes aliaset atomisk. Ved feil før
aliasbyttet blir gammel indeks værende i bruk; den nye beholdes for feilsøking.
Etter aliasbyttet slettes bare indekser med jobbens eget navnemønster og
miljøsuffiks som er **minst 48 timer gamle**, og som **ikke har noe alias**.
Feil under opprydding logges som advarsel og endrer ikke resultatet av en
vellykket import.

## Lokal utvikling

```bash
bun install
bun run compose:up
cp .env.example .env
bun start
```

Uten `ENVIRONMENT` brukes `DEVELOPMENT`: Databricks-mocken leser data fra
`dev/fixtures`, og alias og indeks får suffikset `-development`.
Fixturen inneholder tre representative adresser som mocken varierer til
100 unike dokumenter. Minstekravet til antall
dokumenter er 1 i DEVELOPMENT og fortsatt 1 000 i PROD og PRODTEST.
Elasticsearch kjører lokalt på port 9201. Bun leser `.env` automatisk.
`bun run start:mock` velger `DEVELOPMENT` eksplisitt uten å endre `.env`.
`bun run reset` sletter lokale indekser og importerer fixtures på nytt,
mens `bun run es:reset` bare sletter lokale indekser. Stopp Elasticsearch
med `bun run compose:down`.

For kjøring mot ekte tjenester: sett `DATABRICKS_HOST`,
`DATABRICKS_HTTP_PATH`, `DATABRICKS_TABLE`, `DATABRICKS_CLIENT_SECRET`
og `ES_URL` i `.env`. `DATABRICKS_CLIENT_SECRET` er en JSON-streng
med `client_id` og `client_secret`, for eksempel
`'{"client_id":"id","client_secret":"secret"}'`. Sett deretter
`ENVIRONMENT=PROD` (indeksnavn med `-prod`, alias fortsatt `ed_adressesok`)
eller `ENVIRONMENT=PRODTEST` (indeks og alias med `-prodtest`).
Disse miljøene bruker ekte Databricks. Sett også `ES_API_KEY`
hvis clusteret krever det.
Oppdater verdien i GSM-hemmeligheten
`databricks-to-elastic-databricks-client-secret` til dette JSON-formatet før
utrulling; den separate `databricks-to-elastic-databricks-client-id` brukes
ikke lenger.
Ikke legg hemmeligheter i git: tilgang til klienthemmelighet og
Elasticsearch-nøkkel fås via teamets secret-oppsett for SKIP; se
[prod-manifestet](.skip/prod.yaml) og
[prodtest-manifestet](.skip/prodtest.yaml) for navn på miljøvariabler og
referanser til secrets. Ikke-hemmelige Databricks-verdier står i de samme
manifestene.

```bash
bun run test
bun run typecheck
bun run test:integration  # krever bun run compose:up
```

Integrasjonstesten lager et unikt indeks- og aliasprefiks for hver kjøring
(`INTEGRATION_TEST_ID` settes av testen), slik at oppryddingen ikke berører
indekser fra lokal kjøring. Det er ikke et eget driftsmiljø eller en variabel
som må settes ved vanlig kjøring.

## Kjøring på SKIP

Jobben kjører periodisk i [prod](.skip/prod.yaml) og
[prodtest](.skip/prodtest.yaml). Miljøet styrer suffikset,
slik at aliaser og indekser holdes adskilt. Se
[SKIPs jobbdokumentasjon](https://skip.kartverket.no/docs/jobber-skip).

For å kjøre manuelt: finn CronJob-ressursen i Argo CD og velg
**Create Job** i kebab-menyen. Da brukes samme image og konfigurasjon som
ved planlagt kjøring.
