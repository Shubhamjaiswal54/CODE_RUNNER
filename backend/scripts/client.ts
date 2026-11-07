export const API_URL = process.env.API_URL ?? "http://localhost:5000";

export type Submission = {
    id: string;
    lang: string;
    code: string;
    status: "Processing" | "Success" | "Failure";
    output: string | null;
};

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function ensureApiIsUp() {
    try {
        await fetch(API_URL);
    } catch {
        console.error(`Cannot reach the API at ${API_URL}. Start the stack first (docker compose up).`);
        process.exit(1);
    }
}

export async function post(body: unknown) {
    return fetch(`${API_URL}/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: typeof body === "string" ? body : JSON.stringify(body),
    });
}

export async function submit(lang: string, code: string): Promise<string> {
    const res = await post({ lang, code });
    if (res.status !== 202) {
        throw new Error(`Submit failed with ${res.status}: ${await res.text()}`);
    }
    const { submissionId } = (await res.json()) as { submissionId: string };
    return submissionId;
}

export async function waitForResult(id: string, timeoutMs = 60_000, intervalMs = 200): Promise<Submission> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const res = await fetch(`${API_URL}/submission/${id}`);
        if (!res.ok) throw new Error(`Polling ${id} failed with ${res.status}: ${await res.text()}`);
        const { submission } = (await res.json()) as { submission: Submission };
        if (submission.status !== "Processing") return submission;
        await sleep(intervalMs);
    }
    throw new Error(`Timed out after ${timeoutMs / 1000}s waiting for submission ${id}`);
}
