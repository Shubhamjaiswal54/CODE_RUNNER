import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import { createClient } from "redis";
import { prisma } from "./lib/prisma.ts";

const PORT = Number(process.env.PORT ?? 5000);
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "http://localhost:3000";
const QUEUE = "submission";
const SUPPORTED_LANGS = ["js", "py", "c++"];
const MAX_CODE_LENGTH = 100_000;

const app = express();
const client = createClient({ url: process.env.REDIS_URL });
client.on("error", (err) => console.error("Redis Client Error in backend", err));
await client.connect();

app.use(express.json({ limit: "200kb" }));
app.use(cors({ origin: CORS_ORIGIN.split(",") }));

app.get("/", (req: Request, res: Response): void => {
    res.send("<h1>hello there</h1>");
});

app.post("/", async (req: Request, res: Response) => {
    const { lang, code } = req.body ?? {};

    if (typeof lang !== "string" || !SUPPORTED_LANGS.includes(lang)) {
        res.status(400).json({ error: `lang must be one of: ${SUPPORTED_LANGS.join(", ")}` });
        return;
    }
    if (typeof code !== "string" || !code.trim()) {
        res.status(400).json({ error: "code must be a non-empty string" });
        return;
    }
    if (code.length > MAX_CODE_LENGTH) {
        res.status(413).json({ error: `code must be at most ${MAX_CODE_LENGTH} characters` });
        return;
    }

    const submission = await prisma.submission.create({
        data: { lang, code, status: "Processing" },
    });

    try {
        await client.rPush(QUEUE, JSON.stringify({ id: submission.id, lang, code }));
    } catch (error) {
        // Without this the row would stay "Processing" forever and the frontend would never stop polling.
        await prisma.submission.update({
            where: { id: submission.id },
            data: { status: "Failure", output: "Could not queue submission, please try again." },
        });
        throw error;
    }

    res.status(202).json({ message: "processing", submissionId: submission.id });
});

app.get("/submission/:submissionId", async (req: Request<{ submissionId: string }>, res: Response) => {
    const submission = await prisma.submission.findUnique({
        where: { id: req.params.submissionId },
    });

    if (!submission) {
        res.status(404).json({ error: "Submission not found" });
        return;
    }

    res.json({ submission });
});


app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
    const status = (err as { status?: unknown }).status;
    if (typeof status === "number" && status >= 400 && status < 500) {
        res.status(status).json({ error: (err as Error).message });
        return;
    }
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => console.log(`app is listening on the port ${PORT}`));
