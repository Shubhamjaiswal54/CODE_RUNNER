# worker

Redis consumer that runs submitted code and writes the result to Postgres.

The worker uses the Prisma client generated in `../backend`, so run `npm install` and `npm run generate` in `backend/` first.

```bash
cp .env.example .env   # then fill in DATABASE_URL
npm install
npm run dev
```

Requires `node`, `python3` and `g++` on `PATH`, and Redis 6.2+ (for `BLMOVE`).
