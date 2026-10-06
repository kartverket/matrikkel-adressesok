# Bun >= 1.2 kreves: eldre versjoner klarer ikke å importere @elastic/transport.
# Digest pinnet for reproduserbare bygg, samme praksis som rot-Dockerfile.
FROM oven/bun:1.4.2-alpine@sha256:d888c0ae6c86d7866ff10c5aafdd9077b36aee6455b33dd270fb93c0dd5cef6f
WORKDIR /app

# Build-konteksten er repo-roten (ikke databricks-til-elastic/) fordi workspace-
# avhengighetene @matrikkel/shared-logging og @matrikkel/shared-schema ligger i
# packages/ ved siden av denne mappen, og bun install må finne dem for å løse
# "workspace:*"-versjonene.
COPY package.json bun.lock ./
COPY packages ./packages
COPY databricks-til-elastic/package.json ./databricks-til-elastic/package.json
RUN bun install --frozen-lockfile --production --filter databricks-til-elastic

COPY databricks-til-elastic/src ./databricks-til-elastic/src
# Fixtures for DATABRICKS_MOCK=true - brukes inntil ekte Databricks-tilgang er klar.
COPY databricks-til-elastic/dev ./databricks-til-elastic/dev
WORKDIR /app/databricks-til-elastic

# Satt for forutsigbare, UTC-baserte tidsstempler i logger og indeksnavn,
# uavhengig av hvilken sone runtime-miljøet ellers er i.
ENV TZ=UTC
USER bun
ENTRYPOINT ["bun", "run", "src/index.ts"]
