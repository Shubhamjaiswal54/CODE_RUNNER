# Build context is the repo root (see docker-compose.yml).
FROM node:24-bookworm-slim

# Prisma's migration engine needs OpenSSL.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci

COPY backend/ ./
# prisma.config.ts requires a URL, but generate never connects to it.
RUN DATABASE_URL=postgresql://build@localhost/build npx prisma generate

EXPOSE 5000
CMD ["sh", "-c", "npx prisma migrate deploy && exec ./node_modules/.bin/tsx index.ts"]
