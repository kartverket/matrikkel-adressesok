FROM oven/bun:1.4.2-alpine@sha256:d888c0ae6c86d7866ff10c5aafdd9077b36aee6455b33dd270fb93c0dd5cef6f AS production-dependencies
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1.4.2-alpine@sha256:d888c0ae6c86d7866ff10c5aafdd9077b36aee6455b33dd270fb93c0dd5cef6f AS runtime
WORKDIR /app
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY package.json bun.lock ./
COPY src ./src
ENV PORT=3000
EXPOSE 3000
USER bun
CMD ["bun", "run", "start"]
