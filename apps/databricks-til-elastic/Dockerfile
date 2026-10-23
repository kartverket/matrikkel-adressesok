# Bun >= 1.2 kreves: eldre versjoner klarer ikke å importere @elastic/transport.
# Digest pinnet for reproduserbare bygg, samme praksis som rot-Dockerfile.
FROM oven/bun:1.4.4-alpine@sha256:4cf82f5686b196504fe119db3fcd9185b191f82ece82c40680e597228ec6070a
WORKDIR /app

# Build-konteksten er repo-roten (ikke apps/databricks-til-elastic/) fordi workspace-
# avhengighetene @matrikkel/shared-logging og @matrikkel/shared-schema ligger i
# packages/ ved siden av denne mappen, og bun install må finne dem for å løse
# "workspace:*"-versjonene. bun.lock er låst mot *alle* workspaces i apps/*, så
# package.json fra begge appene må være til stede selv om vi bare --filter
# installerer databricks-til-elastic sine avhengigheter.
COPY package.json bun.lock ./
COPY packages ./packages
COPY apps/databricks-til-elastic/package.json ./apps/databricks-til-elastic/package.json
COPY apps/adressesok/package.json ./apps/adressesok/package.json
RUN bun install --frozen-lockfile --production --filter databricks-til-elastic

COPY apps/databricks-til-elastic/src ./apps/databricks-til-elastic/src
WORKDIR /app/apps/databricks-til-elastic

# Satt for forutsigbare, UTC-baserte tidsstempler i logger og indeksnavn,
# uavhengig av hvilken sone runtime-miljøet ellers er i.
ENV TZ=UTC
USER bun
ENTRYPOINT ["bun", "run", "src/index.ts"]
