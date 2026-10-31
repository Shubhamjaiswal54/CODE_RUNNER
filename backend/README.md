# backend

Express API that stores submissions in Postgres and queues them in Redis.

```bash
cp .env.example .env   # then fill in DATABASE_URL
npm install
npm run migrate        # apply migrations
npm run generate       # generate the Prisma client (also used by the worker)
npm run dev
```

`prisma/schema.prisma` here is the single source of truth for the database schema.
