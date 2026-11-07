import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import { execute } from "./runner.js";

// The first g++ run on a machine can take several seconds while the toolchain warms up.
const CPP = { timeout: 30_000 };

async function tempDirCount() {
  const entries = await fs.readdir(os.tmpdir());
  return entries.filter((name) => name.startsWith("code-runner-")).length;
}

test("runs JavaScript", async () => {
  const result = await execute("js", `console.log("hello js")`);
  assert.deepEqual(result, { status: "Success", output: "hello js\n" });
});

test("runs Python", async () => {
  const result = await execute("py", `print("hello py")`);
  assert.deepEqual(result, { status: "Success", output: "hello py\n" });
});

test("compiles and runs C++", CPP, async () => {
  const code = `#include <iostream>\nint main() { std::cout << "hello cpp" << std::endl; }`;
  const result = await execute("c++", code);
  assert.deepEqual(result, { status: "Success", output: "hello cpp\n" });
});

test("reports C++ compile errors", CPP, async () => {
  const result = await execute("c++", `int main() { return undefined_name; }`);
  assert.equal(result.status, "Failure");
  assert.match(result.output, /undefined_name/);
});

test("reports runtime errors with the exit code", async () => {
  const result = await execute("js", `throw new Error("boom")`);
  assert.equal(result.status, "Failure");
  assert.match(result.output, /boom/);
  assert.match(result.output, /exited with code 1/);
});

test("keeps stdout that was printed before a failure", async () => {
  const result = await execute("py", `print("before crash")\nraise SystemExit(3)`);
  assert.equal(result.status, "Failure");
  assert.match(result.output, /before crash/);
  assert.match(result.output, /exited with code 3/);
});

test("reports crashes by signal", CPP, async () => {
  const result = await execute("c++", `int main() { volatile int* p = nullptr; return *p; }`);
  assert.equal(result.status, "Failure");
  assert.match(result.output, /signal SIG(SEGV|BUS)/);
});

test("kills programs that exceed the time limit", async () => {
  const started = Date.now();
  const result = await execute("py", `while True: pass`);
  assert.equal(result.status, "Failure");
  assert.match(result.output, /Time limit exceeded/);
  assert.ok(Date.now() - started < 8_000, "should stop shortly after the 5s limit");
});

test("stops programs that exceed the output limit", async () => {
  const result = await execute("js", `while (true) console.log("x".repeat(100))`);
  assert.equal(result.status, "Failure");
  assert.match(result.output, /Output limit exceeded/);
  assert.ok(result.output.length < 70 * 1024, `output was ${result.output.length} chars`);
});

test("closes stdin so programs that read input don't hang", async () => {
  const started = Date.now();
  const result = await execute("py", `name = input()\nprint(name)`);
  assert.equal(result.status, "Failure");
  assert.match(result.output, /EOFError/);
  assert.ok(Date.now() - started < 3_000);
});

test("does not expose the worker's environment variables", async () => {
  process.env.CODE_RUNNER_TEST_SECRET = "super-secret";
  const result = await execute("js", `console.log(process.env.CODE_RUNNER_TEST_SECRET ?? "not visible")`);
  assert.equal(result.output, "not visible\n");
});

test("gives each submission a fresh directory", async () => {
  await execute("js", `require("fs").writeFileSync("leftover.txt", "data")`);
  const result = await execute("js", `console.log(require("fs").existsSync("leftover.txt"))`);
  assert.equal(result.output, "false\n");
});

test("deletes temp directories after each run", async () => {
  const before = await tempDirCount();
  await execute("js", `console.log(1)`);
  await execute("py", `raise Exception("fail")`);
  await execute("py", `while True: pass`);
  assert.equal(await tempDirCount(), before);
});

test("rejects unsupported languages", async () => {
  const result = await execute("ruby", `puts 1`);
  assert.deepEqual(result, { status: "Failure", output: "Unsupported language: ruby" });
});

test(
  "time limit also stops background processes the program started",
  { todo: "known bug: the worker waits until the background process exits", timeout: 8_000 },
  async () => {
    const code = `import subprocess, time\nsubprocess.Popen(["sleep", "12"])\nwhile True: time.sleep(1)`;
    const result = await execute("py", code);
    assert.match(result.output, /Time limit exceeded/);
  },
);
