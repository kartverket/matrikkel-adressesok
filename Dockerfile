FROM oven/bun:1.3.14-alpine@sha256:5acc90a93e91ff07bf72aa90a7c9f0fa189765aec90b47bdbf2152d2196383c0 AS development-dependencies
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM oven/bun:1.3.14-alpine@sha256:5acc90a93e91ff07bf72aa90a7c9f0fa189765aec90b47bdbf2152d2196383c0 AS production-dependencies
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1.3.14-alpine@sha256:5acc90a93e91ff07bf72aa90a7c9f0fa189765aec90b47bdbf2152d2196383c0 AS test
WORKDIR /app
COPY --from=development-dependencies /app/node_modules ./node_modules
COPY package.json bun.lock tsconfig.json biome.json .gitignore ./
COPY src ./src
COPY test ./test
CMD ["bun", "run", "check"]

FROM oven/bun:1.3.14-alpine@sha256:5acc90a93e91ff07bf72aa90a7c9f0fa189765aec90b47bdbf2152d2196383c0 AS runtime
WORKDIR /app
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY package.json bun.lock ./
COPY src ./src
ENV PORT=3000
EXPOSE 3000
USER bun
CMD ["bun", "run", "start"]
