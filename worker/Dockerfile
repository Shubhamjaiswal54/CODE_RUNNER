# Build context is the repo root: the worker imports the Prisma client generated in backend/.
FROM node:24-bookworm-slim

# Runtimes for submitted code.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY backend/package.json backend/package-lock.json backend/
RUN cd backend && npm ci
COPY backend/prisma backend/prisma
COPY backend/prisma.config.ts backend/
RUN cd backend && DATABASE_URL=postgresql://build@localhost/build npx prisma generate

COPY worker/package.json worker/package-lock.json worker/
RUN cd worker && npm ci
COPY worker/ worker/

WORKDIR /app/worker
# Submitted code runs as this user, so it can't modify the worker's own files.
USER node
CMD ["./node_modules/.bin/tsx", "index.ts"]
