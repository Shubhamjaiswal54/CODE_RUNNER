// End-to-end checks against a running stack: API -> Redis -> worker -> Postgres.
// Usage: npm run test:e2e   (set API_URL to test somewhere other than http://localhost:5000)
import { API_URL, ensureApiIsUp, post, submit, waitForResult } from "./client.ts";

type Expected = { status: "Success" | "Failure"; output: RegExp };

const RUN_CASES: { name: string; lang: string; code: string; expect: Expected }[] = [
    { name: "JavaScript hello world", lang: "js", code: `console.log("hello js")`, expect: { status: "Success", output: /^hello js\n$/ } },
    { name: "Python hello world", lang: "py", code: `print("hello py")`, expect: { status: "Success", output: /^hello py\n$/ } },
    {
        name: "C++ hello world",
        lang: "c++",
        code: `#include <iostream>\nint main() { std::cout << "hello cpp" << std::endl; }`,
        expect: { status: "Success", output: /^hello cpp\n$/ },
    },
    { name: "C++ compile error", lang: "c++", code: `int main() { return nope; }`, expect: { status: "Failure", output: /nope/ } },
    { name: "Python syntax error", lang: "py", code: `print("unclosed`, expect: { status: "Failure", output: /SyntaxError/ } },
    { name: "JavaScript runtime error", lang: "js", code: `throw new Error("boom")`, expect: { status: "Failure", output: /boom/ } },
    { name: "Infinite loop hits the time limit", lang: "py", code: `while True: pass`, expect: { status: "Failure", output: /Time limit exceeded/ } },
    {
        name: "Huge output hits the output limit",
        lang: "js",
        code: `while (true) console.log("x".repeat(100))`,
        expect: { status: "Failure", output: /Output limit exceeded/ },
    },
    { name: "Reading stdin fails fast instead of hanging", lang: "py", code: `input()`, expect: { status: "Failure", output: /EOFError/ } },
    {
        name: "DATABASE_URL is not visible to user code",
        lang: "js",
        code: `console.log(process.env.DATABASE_URL ?? "not visible")`,
        expect: { status: "Success", output: /^not visible\n$/ },
    },
];

const VALIDATION_CASES: { name: string; body: unknown; status: number }[] = [
    { name: "missing lang", body: { code: "print(1)" }, status: 400 },
    { name: "unsupported lang", body: { lang: "ruby", code: "puts 1" }, status: 400 },
    { name: "empty code", body: { lang: "py", code: "   " }, status: 400 },
    { name: "code over 100,000 characters", body: { lang: "py", code: "#".repeat(100_001) }, status: 413 },
    { name: "malformed JSON", body: "{not json", status: 400 },
];

let failures = 0;

function report(name: string, ok: boolean, detail = "") {
    if (!ok) failures++;
    console.log(`${ok ? "✔" : "✖"} ${name}${detail ? `\n    ${detail}` : ""}`);
}

await ensureApiIsUp();
console.log(`Testing ${API_URL}\n\nValidation`);

for (const { name, body, status } of VALIDATION_CASES) {
    const res = await post(body);
    report(`rejects ${name} with ${status}`, res.status === status, res.status === status ? "" : `got ${res.status}`);
}

const missing = await fetch(`${API_URL}/submission/00000000-0000-0000-0000-000000000000`);
report("unknown submission id returns 404", missing.status === 404, missing.status === 404 ? "" : `got ${missing.status}`);

console.log("\nExecution (submitted together, so this also checks results don't get mixed up)");

// Submit everything first so the queue has real work in it, then collect results.
const submitted = await Promise.all(RUN_CASES.map(async (c) => ({ ...c, id: await submit(c.lang, c.code) })));

for (const c of submitted) {
    try {
        const result = await waitForResult(c.id, 90_000);
        const output = result.output ?? "";
        const ok = result.status === c.expect.status && c.expect.output.test(output);
        report(c.name, ok, ok ? "" : `expected ${c.expect.status} matching ${c.expect.output}, got ${result.status}: ${JSON.stringify(output.slice(0, 200))}`);
    } catch (error) {
        report(c.name, false, String(error));
    }
}

console.log(`\n${failures === 0 ? "All checks passed" : `${failures} check(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
