# Build-konteksten er repo-roten (ikke apps/adressesok/) fordi workspace-
# avhengighetene @matrikkel/shared-logging og @matrikkel/shared-schema ligger i
# packages/ ved siden av denne mappen, og bun install må finne dem for å løse
# "workspace:*"-versjonene. bun.lock er låst mot *alle* workspaces i apps/*, så
# package.json fra begge appene må være til stede selv om vi bare --filter
# installerer adressesok sine avhengigheter.
FROM oven/bun:1.4.2-alpine@sha256:d888c0ae6c86d7866ff10c5aafdd9077b36aee6455b33dd270fb93c0dd5cef6f AS production-dependencies
WORKDIR /app
COPY package.json bun.lock ./
COPY packages ./packages
COPY apps/adressesok/package.json ./apps/adressesok/package.json
COPY apps/databricks-til-elastic/package.json ./apps/databricks-til-elastic/package.json
RUN bun install --frozen-lockfile --production --filter adressesok

FROM oven/bun:1.4.2-alpine@sha256:d888c0ae6c86d7866ff10c5aafdd9077b36aee6455b33dd270fb93c0dd5cef6f AS runtime
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
