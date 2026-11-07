# Build context is the repo root (see docker-compose.yml).
FROM oven/bun:1

WORKDIR /app/frontend
COPY frontend/package.json frontend/bun.lock ./
RUN bun install --frozen-lockfile

COPY frontend/ ./

ENV NODE_ENV=production
EXPOSE 3000
CMD ["bun", "src/index.ts"]
