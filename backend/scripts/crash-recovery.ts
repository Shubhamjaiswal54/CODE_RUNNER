// Kills the worker while it is running a job, restarts it, and checks the job still completes.
// Usage: ROUNDS=5 npm run test:crash
// Defaults to the Docker Compose worker; set KILL_CMD and START_CMD to test a worker started another way.
import { execSync } from "node:child_process";
import path from "node:path";
import { ensureApiIsUp, sleep, submit, waitForResult } from "./client.ts";

const ROUNDS = Number(process.env.ROUNDS ?? 3);
const KILL_CMD = process.env.KILL_CMD ?? "docker compose kill worker";
const START_CMD = process.env.START_CMD ?? "docker compose start worker";
const repoRoot = path.resolve(import.meta.dirname, "../..");
// "inherit" rather than pipes: a START_CMD that backgrounds the worker would otherwise keep the pipe open and hang here.
const run = (command: string) => execSync(command, { cwd: repoRoot, stdio: "inherit" });

await ensureApiIsUp();
let recovered = 0;

for (let round = 1; round <= ROUNDS; round++) {
    const token = `survived-${round}`;
    // Takes 3 seconds, so the worker is mid-run when it gets killed.
    const id = await submit("js", `setTimeout(() => console.log("${token}"), 3000)`);
    await sleep(1000);

    run(KILL_CMD);
    await sleep(500);
    run(START_CMD);

    try {
        const result = await waitForResult(id, 60_000);
        const ok = result.status === "Success" && result.output?.trim() === token;
        if (ok) recovered++;
        console.log(`${ok ? "✔" : "✖"} round ${round}: ${result.status} ${JSON.stringify(result.output)}`);
    } catch (error) {
        console.log(`✖ round ${round}: ${error}`);
    }
}

console.log(`\n${recovered}/${ROUNDS} jobs completed after the worker was killed mid-run`);
process.exit(recovered === ROUNDS ? 0 : 1);
