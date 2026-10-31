import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const COMPILE_TIMEOUT_MS = 15_000;
const RUN_TIMEOUT_MS = 5_000;
const MAX_OUTPUT_BYTES = 64 * 1024;

export type RunResult = {
  stdout: string;
  stderr: string;
  exitcode: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  truncated: boolean;
};

export type Outcome = { status: "Success" | "Failure"; output: string };

function runProcess(command: string, args: string[], cwd: string, timeoutMs: number): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      // Don't leak the worker's environment (DATABASE_URL etc.) into user code.
      env: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: cwd, TMPDIR: cwd },
      // stdin is closed so programs that read input get EOF instead of hanging forever.
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let bytes = 0;
    let timedOut = false;
    let truncated = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    const collect = (chunk: Buffer, append: (text: string) => void) => {
      if (truncated) return;
      const remaining = MAX_OUTPUT_BYTES - bytes;
      if (chunk.length > remaining) {
        append(chunk.subarray(0, remaining).toString());
        truncated = true;
        child.kill("SIGKILL");
        return;
      }
      bytes += chunk.length;
      append(chunk.toString());
    };

    child.stdout.on("data", (chunk: Buffer) => collect(chunk, (text) => (stdout += text)));
    child.stderr.on("data", (chunk: Buffer) => collect(chunk, (text) => (stderr += text)));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (exitcode, signal) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitcode, signal, timedOut, truncated });
    });
  });
}

type LangConfig = {
  file: string;
  compile?: (dir: string) => Promise<RunResult>;
  run: (dir: string) => Promise<RunResult>;
};

const LANGUAGES: Record<string, LangConfig> = {
  js: {
    file: "main.js",
    run: (dir) => runProcess("node", ["main.js"], dir, RUN_TIMEOUT_MS),
  },
  py: {
    file: "main.py",
    run: (dir) => runProcess("python3", ["main.py"], dir, RUN_TIMEOUT_MS),
  },
  "c++": {
    file: "main.cpp",
    compile: (dir) => runProcess("g++", ["main.cpp", "-o", "main"], dir, COMPILE_TIMEOUT_MS),
    run: (dir) => runProcess(path.join(dir, "main"), [], dir, RUN_TIMEOUT_MS),
  },
};

function isSuccess(result: RunResult) {
  return result.exitcode === 0 && !result.timedOut && !result.truncated;
}

function describeFailure(result: RunResult, timeoutMs: number) {
  const parts = [result.stdout, result.stderr].filter((part) => part.length > 0);
  if (result.timedOut) parts.push(`Time limit exceeded (${timeoutMs / 1000}s)`);
  else if (result.truncated) parts.push(`Output limit exceeded (${MAX_OUTPUT_BYTES / 1024} KB)`);
  else if (result.signal) parts.push(`Process killed by signal ${result.signal}`);
  else parts.push(`Process exited with code ${result.exitcode}`);
  return parts.join("\n");
}

export async function execute(lang: string, code: string): Promise<Outcome> {
  const config = LANGUAGES[lang];
  if (!config) return { status: "Failure", output: `Unsupported language: ${lang}` };

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "code-runner-"));
  try {
    await fs.writeFile(path.join(dir, config.file), code);

    if (config.compile) {
      const compilation = await config.compile(dir);
      if (!isSuccess(compilation)) {
        return { status: "Failure", output: describeFailure(compilation, COMPILE_TIMEOUT_MS) };
      }
    }

    const result = await config.run(dir);
    if (!isSuccess(result)) {
      return { status: "Failure", output: describeFailure(result, RUN_TIMEOUT_MS) };
    }
    return { status: "Success", output: result.stdout };
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
