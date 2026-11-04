# Bun >= 1.2 kreves: eldre versjoner klarer ikke å importere @elastic/transport.
# Digest pinnet for reproduserbare bygg, samme praksis som rot-Dockerfile.
FROM dhi.io/bun:1.4.4-alpine3.24-dev@sha256:2699d4021abe1deee50092d5dc3043f93779d6d1a7ef2dadff8a8a6fa1324b76 AS production-dependencies
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

FROM dhi.io/bun:1.4.4-alpine3.24@sha256:109847d243a134c7fefc3f3d39d26c2b2080117b36149bb3b307de7ff81e9217 AS runtime
WORKDIR /app
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=production-dependencies /app/apps/databricks-til-elastic/node_modules ./apps/databricks-til-elastic/node_modules
COPY --from=production-dependencies /app/packages ./packages
COPY package.json bun.lock ./
COPY apps/databricks-til-elastic/package.json ./apps/databricks-til-elastic/package.json
COPY apps/databricks-til-elastic/src ./apps/databricks-til-elastic/src
WORKDIR /app/apps/databricks-til-elastic

# Satt for forutsigbare, UTC-baserte tidsstempler i logger og indeksnavn,
# uavhengig av hvilken sone runtime-miljøet ellers er i.
ENV TZ=UTC
USER 65532:65532
ENTRYPOINT ["bun", "run", "src/index.ts"]
