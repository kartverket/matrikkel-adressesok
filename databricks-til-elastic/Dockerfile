# Bun >= 1.2 kreves: eldre versjoner klarer ikke å importere @elastic/transport.
# Digest pinnet for reproduserbare bygg, samme praksis som rot-Dockerfile.
FROM oven/bun:1.4.2-alpine@sha256:d888c0ae6c86d7866ff10c5aafdd9077b36aee6455b33dd270fb93c0dd5cef6f
WORKDIR /app

COPY package.json ./
COPY bun.lock ./
RUN bun install --frozen-lockfile --production

COPY src ./src

# Satt for forutsigbare, UTC-baserte tidsstempler i logger og indeksnavn,
# uavhengig av hvilken sone runtime-miljøet ellers er i.
ENV TZ=UTC
USER bun
ENTRYPOINT ["bun", "run", "src/index.ts"]
