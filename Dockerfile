FROM oven/bun:1.3.12-debian AS development-dependencies
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM oven/bun:1.3.12-debian AS production-dependencies
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1.3.12-debian AS test
WORKDIR /app
COPY --from=development-dependencies /app/node_modules ./node_modules
COPY package.json bun.lock tsconfig.json biome.json .gitignore ./
COPY src ./src
COPY test ./test
CMD ["bun", "run", "check"]

FROM oven/bun:1.3.12-debian AS runtime
WORKDIR /app
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY package.json bun.lock ./
COPY src ./src
ENV PORT=3000
EXPOSE 3000
USER bun
CMD ["bun", "run", "start"]
