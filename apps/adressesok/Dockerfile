# Build-konteksten er repo-roten (ikke apps/adressesok/) fordi workspace-
# avhengighetene @matrikkel/shared-logging og @matrikkel/shared-schema ligger i
# packages/ ved siden av denne mappen, og bun install må finne dem for å løse
# "workspace:*"-versjonene. bun.lock er låst mot *alle* workspaces i apps/*, så
# package.json fra begge appene må være til stede selv om vi bare --filter
# installerer adressesok sine avhengigheter.
FROM dhi.io/bun:1.4.4-alpine3.24-dev@sha256:2699d4021abe1deee50092d5dc3043f93779d6d1a7ef2dadff8a8a6fa1324b76 AS production-dependencies
WORKDIR /app
COPY package.json bun.lock ./
COPY packages ./packages
COPY apps/adressesok/package.json ./apps/adressesok/package.json
COPY apps/databricks-til-elastic/package.json ./apps/databricks-til-elastic/package.json
RUN bun install --frozen-lockfile --production --filter adressesok

FROM dhi.io/bun:1.4.4-alpine3.24@sha256:109847d243a134c7fefc3f3d39d26c2b2080117b36149bb3b307de7ff81e9217 AS runtime
WORKDIR /app
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=production-dependencies /app/apps/adressesok/node_modules ./apps/adressesok/node_modules
COPY --from=production-dependencies /app/packages ./packages
COPY package.json bun.lock ./
COPY apps/adressesok/package.json ./apps/adressesok/package.json
COPY apps/adressesok/src ./apps/adressesok/src
WORKDIR /app/apps/adressesok
ENV PORT=3000
EXPOSE 3000
USER bun
CMD ["bun", "run", "start"]
