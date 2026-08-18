# CODE RUNNER — Online Code Execution Platform

A minimal online code judge/runner. Users submit JavaScript, Python, or C++ code through a web UI; a backend queues the submission in Redis; a worker process picks it up, executes it, and writes the result back to a database. The frontend polls for the result and displays it.

## Architecture

```
┌───────────┐      POST /        ┌──────────────┐      RPUSH        ┌──────────┐
│  Frontend │ ─────────────────▶ │   Backend     │ ─────────────────▶│  Redis   │
│  (React)  │                    │  (Express)    │                    │  Queue   │
│           │ ◀───────────────── │               │                    └────┬─────┘
└───────────┘   GET /submission  └──────┬────────┘                         │ BLPOP
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
3. Worker blocks on `BLPOP submission`, pulls a job, writes the code to a temp file, and executes it via `child_process.spawn`.
4. Worker updates the `Submission` row with `status: "Success" | "Failure"` and the captured `stdout`.
5. Frontend polls `GET /submission/:id` until the status is no longer `"Processing"`.

## Tech Stack

| Layer     | Tech                                   |
|-----------|-----------------------------------------|
| Frontend  | React, TypeScript, Axios, shadcn/ui     |
| Backend   | Express, TypeScript, Prisma             |
| Queue     | Redis (list + `BLPOP`)                  |
| Worker    | Node.js `child_process.spawn`           |
| Database  | PostgreSQL (or whatever Prisma is configured for) |
| Runtimes executed | Node.js, Python, g++/C++        |

## Project Structure

```
.
├── frontend/        # React app (submission form + result view)
├── backend/         # Express API (create + fetch submissions)
├── worker/          # Redis consumer that executes submitted code
└── prisma/          # Schema + client shared by backend and worker
```

## Prerequisites

- Node.js (v18+ recommended)
- Redis server running locally (`redis-server`)
- PostgreSQL (or your configured Prisma datasource)
- `g++` and `python` available on the worker's `PATH`

## Setup

```bash
# Install dependencies in each package
cd backend && npm install
cd ../worker && npm install
cd ../frontend && npm install

# Configure Prisma
cd ../backend
npx prisma migrate dev
npx prisma generate
```

Set your database connection string in a `.env` file (used by Prisma in both `backend` and `worker`):

```
DATABASE_URL="postgresql://user:password@localhost:5432/codex"
```

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

# 4. Frontend
cd frontend
npm run dev
```

Open the frontend, pick a language, write some code, and hit Submit.

## API

### `POST /`
Creates a submission and queues it for execution.

**Body:**
```json
{ "lang": "js" | "py" | "c++", "code": "console.log('hi')" }
```

**Response:**
```json
{ "message": "processing", "submissionId": "..." }
```

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

## ⚠️ Known Limitations / Security Warning

This project currently **executes untrusted user code directly on the host machine** with no sandboxing. It is suitable for local experimentation only and **must not be exposed to untrusted users in its current form**. Before any real deployment, the worker needs:

- **Sandboxing** — run submissions inside ephemeral Docker containers (or gVisor/Firecracker/nsjail), not directly via `spawn`.
- **Resource limits** — CPU, memory, and process limits per submission.
- **Execution timeouts** — kill long-running or infinite-loop submissions.
- **Network isolation** — submitted code should not have outbound network access.
- **Per-submission file isolation** — temp files are currently written to fixed shared paths (`./user_data/js`, `./user_data/py`, `./user_data/c++`), which will collide under concurrent execution. These should be namespaced by submission ID.

## Roadmap / TODO

- [ ] Sandbox code execution (Docker-based worker)
- [ ] Per-submission temp directories keyed by submission ID
- [ ] Execution timeouts with process termination
- [ ] Resource limits (memory/CPU) per submission
- [ ] Support additional languages
- [ ] Input/stdin support for submissions
- [ ] Multiple test cases per submission with pass/fail scoring
