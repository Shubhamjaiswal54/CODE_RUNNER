// import { createClient } from 'redis';
// import { spawn } from "node:child_process";
// import fs from "node:fs";
// import { prisma } from "./lib/prisma.js";

// const client = await createClient()
//     .on("error", (err) => console.log("Redis Client Error in worker ", err))
//     .connect();


// function runProcess(command: string, args: string[]): Promise<{ stdout: string, stderror: string, exitcode: number | null }> {
//     return new Promise((resolve, reject) => {
//         const child = spawn(command, args);
//         let stdout = "";
//         let stderror = "";


//         child.stdout.on("data", (data) => {
//             stdout += data.toString();
//         })

//         child.stderr.on("data", (data) => {
//             stderror += data.toString();
//         })
//         child.on("error", (err) => {
//             reject(err);
//         });
//         child.on("close", (exitcode) => {
//             resolve({ stdout, stderror, exitcode });
//         })

//     })
// }

// while (1) {

//     const result = await client.blPop("submission", 0);
//     const obj = result?.element;
//     if (!obj) continue;
//     console.log("woker received " + obj);
//     const { lang, code, id } = JSON.parse(obj);
//     if (lang == 'js') {


//         fs.writeFileSync("./user_data/js", code);
//         try {

//             const result = await runProcess("node", ["./user_data/js"]);
//             console.log("result is " + result.stderror + result.exitcode + result.stderror);

//             if (result.exitcode !== 0) {
//                 await prisma.submission.update({
//                     where: {
//                         id: id
//                     },

//                     data: {
//                         status: "Failure",
//                     }
//                 })
//             } else {
//                 console.log("output is => " + result.stdout);

//                 await prisma.submission.update({
//                     where: {
//                         id: id
//                     },

//                     data: {
//                         status: "Success",
//                         output: result.stdout,
//                     }
//                 })
//             }

//         } catch (error) {
//             console.log("something wrong with execution of js error");
//         }


//     }

//     if (lang == 'py') {

//         fs.writeFileSync("./user_data/py", code);
//         const result = await runProcess("python", ["./user_data/py"]);

//         if (result.exitcode !== 0) {
//             await prisma.submission.update({
//                 where: {
//                     id: id
//                 },

//                 data: {
//                     status: "Failure",
//                 }
//             })
//         } else {
//             await prisma.submission.update({
//                 where: {
//                     id: id
//                 },

//                 data: {
//                     status: "Success",
//                     output: result.stdout,
//                 }
//             })
//         }
//     }

//     if (lang == 'c++') {

//         fs.writeFileSync("./user_data/c++", code);

//         const compilation = await runProcess("g++ -o out main.cpp", ["./user_data/c++"]);

//         if (compilation.exitcode !== 0) {
//             await prisma.submission.update({
//                 where: {
//                     id: id
//                 },

//                 data: {
//                     status: "Failure",
//                 }
//             })

//         } else {
//             const result = await runProcess("g++", ["./user_data/out"]);

//             if (result.exitcode === 0) {

//                 await prisma.submission.update({
//                     where: {
//                         id: id
//                     },

//                     data: {
//                         status: "Success",
//                         output: result.stdout,
//                     }
//                 })
//             }

//         }


//     }

// }

import { createClient } from "redis";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { prisma } from "./lib/prisma.js";

const client = await createClient()
  .on("error", (err) => console.log("Redis Client Error in worker", err))
  .connect();

type RunResult = { stdout: string; stderror: string; exitcode: number | null };

function runProcess(command: string, args: string[]): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args);
    let stdout = "";
    let stderror = "";

    child.stdout.on("data", (data) => (stdout += data.toString()));
    child.stderr.on("data", (data) => (stderror += data.toString()));
    child.on("error", (err) => reject(err));
    child.on("close", (exitcode) => resolve({ stdout, stderror, exitcode }));
  });
}

type LangConfig = {
  file: string;
  // Optional compile step, run before `run`. Returns null if there's nothing to compile.
  compile?: (file: string) => Promise<RunResult>;
  run: (file: string) => Promise<RunResult>;
};

const LANGUAGES: Record<string, LangConfig> = {
  js: {
    file: "./user_data/main.js",
    run: (file) => runProcess("node", [file]),
  },
  py: {
    file: "./user_data/main.py",
    run: (file) => runProcess("python3", [file]),
  },
  "c++": {
    file: "./user_data/main.cpp",
    compile: (file) => runProcess("g++", [file, "-o", "./user_data/out"]),
    run: () => runProcess("./user_data/out", []),
  },
};

async function updateSubmission(id: string, status: "Success" | "Failure", output: string) {
  await prisma.submission.update({
    where: { id },
    data: { status, output },
  });
}

async function processSubmission(lang: string, code: string, id: string) {
  const config = LANGUAGES[lang];
  if (!config) {
    await updateSubmission(id, "Failure", `Unsupported language: ${lang}`);
    return;
  }

  fs.writeFileSync(config.file, code);

  if (config.compile) {
    const compilation = await config.compile(config.file);
    if (compilation.exitcode !== 0) {
      await updateSubmission(id, "Failure", compilation.stderror);
      return;
    }
  }

  const result = await config.run(config.file);
  if (result.exitcode !== 0) {
    await updateSubmission(id, "Failure", result.stderror);
  } else {
    await updateSubmission(id, "Success", result.stdout);
  }
}

while (true) {
  const result = await client.blPop("submission", 0);
  const obj = result?.element;
  if (!obj) continue;

  console.log("worker received " + obj);
  const { lang, code, id } = JSON.parse(obj);

  try {
    await processSubmission(lang, code, id);
  } catch (error) {
    console.log(`Execution error for submission ${id}:`, error);
    await updateSubmission(id, "Failure", String(error));
  }
}