import { createClient } from "redis";
import { prisma } from "./lib/prisma.js";
import { execute } from "./runner.js";

const QUEUE = "submission";
// Jobs sit here while running, so a crashed worker can pick them back up on restart.
const PROCESSING_QUEUE = `submission:processing:${process.env.WORKER_ID ?? "default"}`;

const client = await createClient({ url: process.env.REDIS_URL })
  .on("error", (err) => console.log("Redis Client Error in worker", err))
  .connect();

async function updateSubmission(id: string, status: "Success" | "Failure", output: string) {
  await prisma.submission.update({
    where: { id },
    data: { status, output },
  });
}

async function handleJob(raw: string) {
  let job: { id?: unknown; lang?: unknown; code?: unknown };
  try {
    job = JSON.parse(raw);
  } catch {
    console.log("Dropping malformed job:", raw);
    return;
  }

  const { id, lang, code } = job;
  if (typeof id !== "string" || typeof lang !== "string" || typeof code !== "string") {
    console.log("Dropping job with missing fields:", raw);
    return;
  }

  console.log(`worker received submission ${id} (${lang})`);
  try {
    const { status, output } = await execute(lang, code);
    await updateSubmission(id, status, output);
  } catch (error) {
    console.log(`Execution error for submission ${id}:`, error);
    try {
      await updateSubmission(id, "Failure", "Internal error while running your code.");
    } catch (dbError) {
      console.log(`Could not record failure for submission ${id}:`, dbError);
    }
  }
}

let recovered = 0;
while (await client.lMove(PROCESSING_QUEUE, QUEUE, "RIGHT", "LEFT")) recovered++;
if (recovered > 0) console.log(`Re-queued ${recovered} unfinished job(s) from a previous run`);

while (true) {
  try {
    const raw = await client.blMove(QUEUE, PROCESSING_QUEUE, "LEFT", "RIGHT", 0);
    if (!raw) continue;
    await handleJob(raw);
    await client.lRem(PROCESSING_QUEUE, 1, raw);
  } catch (error) {
    console.log("Worker loop error, retrying in 1s:", error);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}
