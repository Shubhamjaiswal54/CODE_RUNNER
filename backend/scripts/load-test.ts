// Load test: sends TOTAL submissions with CONCURRENCY in flight and reports throughput and latency.
// Usage: TOTAL=200 CONCURRENCY=20 LANGS=js,py,c++ npm run test:load
import { API_URL, ensureApiIsUp, submit, waitForResult } from "./client.ts";

const TOTAL = Number(process.env.TOTAL ?? 100);
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 10);
const LANGS = (process.env.LANGS ?? "js,py").split(",");

// Each program prints a unique token, so a result that belongs to another submission is caught.
const PROGRAMS: Record<string, (token: string) => string> = {
    js: (token) => `console.log("${token}")`,
    py: (token) => `print("${token}")`,
    "c++": (token) => `#include <iostream>\nint main() { std::cout << "${token}" << std::endl; }`,
};

for (const lang of LANGS) {
    if (!PROGRAMS[lang]) throw new Error(`Unknown language in LANGS: ${lang}`);
}

type Outcome = "correct" | "wrong output" | "failed" | "error";
const submitMs: number[] = [];
const totalMs: number[] = [];
const outcomes: Record<Outcome, number> = { correct: 0, "wrong output": 0, failed: 0, error: 0 };
const errors = new Set<string>();

async function runOne(i: number) {
    const lang = LANGS[i % LANGS.length]!;
    const token = `token-${i}-${Math.random().toString(36).slice(2)}`;
    const started = performance.now();
    try {
        const id = await submit(lang, PROGRAMS[lang]!(token));
        submitMs.push(performance.now() - started);
        const result = await waitForResult(id, 300_000, 250);
        totalMs.push(performance.now() - started);
        if (result.status !== "Success") outcomes.failed++;
        else if (result.output?.trim() !== token) outcomes["wrong output"]++;
        else outcomes.correct++;
    } catch (error) {
        outcomes.error++;
        errors.add(String(error));
    }
}

function percentile(values: number[], p: number) {
    if (values.length === 0) return NaN;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;
}

function row(label: string, values: number[]) {
    const fmt = (ms: number) => (ms < 1000 ? `${ms.toFixed(0)}ms` : `${(ms / 1000).toFixed(2)}s`).padStart(8);
    return `${label.padEnd(22)}${fmt(percentile(values, 50))}${fmt(percentile(values, 95))}${fmt(percentile(values, 99))}${fmt(Math.max(...values))}`;
}

await ensureApiIsUp();
console.log(`Sending ${TOTAL} submissions (${LANGS.join(", ")}) to ${API_URL} with ${CONCURRENCY} in flight...\n`);

const started = performance.now();
let next = 0;
let done = 0;
const progress = setInterval(() => process.stdout.write(`\r${done}/${TOTAL} finished`), 500);

await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, TOTAL) }, async () => {
        while (next < TOTAL) {
            await runOne(next++);
            done++;
        }
    }),
);

clearInterval(progress);
const seconds = (performance.now() - started) / 1000;

console.log(`\r${TOTAL}/${TOTAL} finished in ${seconds.toFixed(1)}s\n`);
console.log(`Throughput: ${(TOTAL / seconds).toFixed(2)} submissions/s (${((TOTAL / seconds) * 60).toFixed(0)}/min)\n`);
console.log(`${"Latency".padEnd(22)}${"p50".padStart(8)}${"p95".padStart(8)}${"p99".padStart(8)}${"max".padStart(8)}`);
console.log(row("Submit (API only)", submitMs));
console.log(row("Submit to result", totalMs));
console.log(`\nCorrect: ${outcomes.correct}   Wrong output: ${outcomes["wrong output"]}   Failed runs: ${outcomes.failed}   Errors: ${outcomes.error}`);
for (const error of errors) console.log(`  ${error}`);

process.exit(outcomes.correct === TOTAL ? 0 : 1);
