FROM oven/bun:1.4.0-alpine@sha256:07235578f79ef8c6f97d94aee7938e76f5cdba5f21ae5dbfdd3d3d38058437eb AS production-dependencies
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1.4.0-alpine@sha256:07235578f79ef8c6f97d94aee7938e76f5cdba5f21ae5dbfdd3d3d38058437eb AS runtime
WORKDIR /app
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY package.json bun.lock ./
COPY src ./src
ENV PORT=3000
EXPOSE 3000
USER bun
CMD ["bun", "run", "start"]
