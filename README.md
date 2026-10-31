# CODE RUNNER — Online Code Execution Platform

A minimal online code judge/runner. Users submit JavaScript, Python, or C++ code through a web UI; a backend queues the submission in Redis; a worker process picks it up, executes it, and writes the result back to a database. The frontend polls for the result and displays it.

## Architecture

```
┌───────────┐      POST /        ┌──────────────┐      RPUSH        ┌──────────┐
│  Frontend │ ─────────────────▶ │   Backend     │ ─────────────────▶│  Redis   │
│  (React)  │                    │  (Express)    │                    │  Queue   │
│           │ ◀───────────────── │               │                    └────┬─────┘
└───────────┘   GET /submission  └──────┬────────┘                         │ BLMOVE
                    /:id                │                                  ▼
                                         │ writes/reads               ┌──────────┐
                                         ▼                            │  Worker  │
                                  ┌──────────────┐                    │ (Node)   │
                                  │  PostgreSQL   │ ◀──────────────── │          │
                                  │  (via Prisma) │     updates       └──────────┘
                                  └──────────────┘                   spawns node/
                                                                      python/g++
```

**Flow:**
1. Frontend sends `{ lang, code }` to the backend.
2. Backend creates a `Submission` row (`status: "Processing"`) and pushes the job onto a Redis list (`submission`).
3. Worker blocks on `BLMOVE`, which moves the job into a per-worker processing list (so it is re-queued if the worker crashes). It writes the code into a fresh temp directory and executes it via `child_process.spawn` with a time limit and output limit.
4. Worker updates the `Submission` row with `status: "Success" | "Failure"` and the program output (on failure: stdout, stderr and the reason, e.g. time limit exceeded).
5. Frontend polls `GET /submission/:id` until the status is no longer `"Processing"` (giving up after about 60 seconds).

## Tech Stack

| Layer     | Tech                                   |
|-----------|-----------------------------------------|
| Frontend  | React, TypeScript, Axios, shadcn/ui     |
| Backend   | Express, TypeScript, Prisma             |
| Queue     | Redis (list + `BLMOVE`)                 |
| Worker    | Node.js `child_process.spawn`           |
| Database  | PostgreSQL (or whatever Prisma is configured for) |
| Runtimes executed | Node.js, Python, g++/C++        |

## Project Structure

```
.
├── frontend/        # React app served by Bun (submission form + result view)
├── backend/         # Express API + Prisma schema/migrations (single source of truth)
└── worker/          # Redis consumer that executes submitted code (uses backend's Prisma client)
```

## Prerequisites

- Node.js (v18+ recommended) for the backend and worker
- [Bun](https://bun.com) for the frontend
- Redis 6.2+ running locally (`redis-server`)
- PostgreSQL
- `node`, `python3` and `g++` available on the worker's `PATH`

## Setup

Copy `.env.example` to `.env` in both `backend/` and `worker/` and set `DATABASE_URL`:

```
DATABASE_URL="postgresql://user:password@localhost:5432/coderunner"
```

```bash
# Backend first: the worker imports the Prisma client generated here
cd backend
npm install
npm run migrate
npm run generate

cd ../worker && npm install
cd ../frontend && bun install
```

To point the frontend at a backend other than `http://localhost:5000`, set `BUN_PUBLIC_API_URL`. If the frontend is not served from `http://localhost:3000`, set `CORS_ORIGIN` in `backend/.env`.

## Running

Start each piece in its own terminal:

```bash
# 1. Redis
redis-server

# 2. Backend (port 5000)
cd backend
npm run dev

# 3. Worker
cd worker
npm run dev

# 4. Frontend (port 3000)
cd frontend
bun dev
```

Open the frontend, pick a language, write some code, and hit Run.

## API

### `POST /`
Creates a submission and queues it for execution.

**Body:**
```json
{ "lang": "js" | "py" | "c++", "code": "console.log('hi')" }
```

**Response (`202`):**
```json
{ "message": "processing", "submissionId": "..." }
```

Returns `400` with `{ "error": "..." }` for a missing/unsupported `lang` or empty `code`, and `413` if `code` is longer than 100,000 characters.

### `GET /submission/:submissionId`
Fetches the current status/result of a submission.

**Response:**
```json
{
  "submission": {
    "id": "...",
    "lang": "js",
    "code": "...",
    "status": "Processing" | "Success" | "Failure",
    "output": "..."
  }
}
```

Returns `404` with `{ "error": "Submission not found" }` for an unknown id.

## ⚠️ Known Limitations / Security Warning

This project currently **executes untrusted user code directly on the host machine** with no sandboxing. It is suitable for local experimentation only and **must not be exposed to untrusted users in its current form**.

Already in place: each submission runs in its own temp directory, with a 5s run limit (15s for compiling), a 64 KB output limit, stdin closed, and a minimal environment (`PATH`, plus `HOME`/`TMPDIR` pointing at the temp directory), so secrets like `DATABASE_URL` are not passed to user code. None of this stops code from reading or writing files elsewhere on the machine or using the network. Before any real deployment, the worker still needs:

- **Sandboxing** — run submissions inside ephemeral Docker containers (or gVisor/Firecracker/nsjail), not directly via `spawn`.
- **Resource limits** — CPU, memory, and process limits per submission.
- **Network isolation** — submitted code should not have outbound network access.

## Roadmap / TODO

- [ ] Sandbox code execution (Docker-based worker)
- [x] Per-submission temp directories
- [x] Execution timeouts with process termination
- [ ] Resource limits (memory/CPU) per submission
- [ ] Support additional languages
- [ ] Input/stdin support for submissions
- [ ] Multiple test cases per submission with pass/fail scoring
