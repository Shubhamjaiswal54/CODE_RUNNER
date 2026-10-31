import "./index.css";
import { useState, useRef, useEffect } from "react";
import { Button } from "./components/ui/button";
import { CodeEditor } from "./components/CodeEditor";
import axios from "axios";

type Language = "js" | "py" | "c++";
type Status = "idle" | "running" | "done" | "error";

const LANGUAGES: { id: Language; label: string; file: string; accent: string; indent: string; starter: string }[] = [
  {
    id: "js",
    label: "JavaScript",
    file: "main.js",
    accent: "#f0db4f",
    indent: "  ",
    starter: `console.log("Hello, world!");\n`,
  },
  {
    id: "py",
    label: "Python",
    file: "main.py",
    accent: "#4b8bbe",
    indent: "    ",
    starter: `print("Hello, world!")\n`,
  },
  {
    id: "c++",
    label: "C++",
    file: "main.cpp",
    accent: "#659ad2",
    indent: "    ",
    starter: `#include <iostream>\n\nint main() {\n    std::cout << "Hello, world!" << std::endl;\n    return 0;\n}\n`,
  },
];

// Bun inlines BUN_PUBLIC_* variables at bundle time (see bunfig.toml and build.ts).
const base_url =
  (typeof process !== "undefined" && process.env.BUN_PUBLIC_API_URL) || "http://localhost:5000";
const FIRST_POLL_DELAY_MS = 250;
const MAX_POLL_DELAY_MS = 1500;
const MAX_WAIT_MS = 60_000;
const STORAGE_KEY = "code-runner:v1";

type Saved = { lang: Language; code: Record<Language, string> };

function starterCode(): Record<Language, string> {
  return Object.fromEntries(LANGUAGES.map((l) => [l.id, l.starter])) as Record<Language, string>;
}

function loadSaved(): Saved {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (saved && LANGUAGES.some((l) => l.id === saved.lang)) {
      return { lang: saved.lang, code: { ...starterCode(), ...saved.code } };
    }
  } catch {}
  return { lang: "js", code: starterCode() };
}

function errorMessage(err: unknown, fallback: string) {
  if (axios.isAxiosError(err) && err.response) {
    return err.response.data?.error ?? `Server error (${err.response.status})`;
  }
  return fallback;
}

const statusConfig: Record<Status, { label: string; dot: string; pulse: boolean }> = {
  idle: { label: "Ready", dot: "#6b7280", pulse: false },
  running: { label: "Running…", dot: "#fbbf24", pulse: true },
  done: { label: "Success", dot: "#34d399", pulse: false },
  error: { label: "Failed", dot: "#f87171", pulse: false },
};

const App = () => {
  const [initial] = useState(loadSaved);
  const [lang, setLang] = useState<Language>(initial.lang);
  const [codeByLang, setCodeByLang] = useState(initial.code);
  const [res, setRes] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [runInfo, setRunInfo] = useState<{ file: string; seconds: number } | null>(null);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const [copied, setCopied] = useState(false);
  const pollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  const activeLang = LANGUAGES.find((l) => l.id === lang)!;
  const code = codeByLang[lang];

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (pollTimeout.current) clearTimeout(pollTimeout.current);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ lang, code: codeByLang }));
  }, [lang, codeByLang]);

  function setCode(value: string) {
    setCodeByLang((prev) => ({ ...prev, [lang]: value }));
  }

  function finish(nextStatus: Status, output: string, file: string, startedAt: number) {
    setStatus(nextStatus);
    setRes(output);
    setRunInfo({ file, seconds: (Date.now() - startedAt) / 1000 });
  }

  async function handleSubmit() {
    if (!code.trim() || status === "running") return;
    const startedAt = Date.now();
    setStatus("running");
    setRes("");
    setRunInfo(null);
    try {
      const response = await axios.post(base_url, { lang, code });
      pollBackend(response.data.submissionId, activeLang.file, startedAt, FIRST_POLL_DELAY_MS);
    } catch (err) {
      finish("error", errorMessage(err, "Could not reach the runner. Is the server running?"), activeLang.file, startedAt);
    }
  }

  function pollBackend(submissionId: string, file: string, startedAt: number, delay: number) {
    pollTimeout.current = setTimeout(async () => {
      try {
        const response = await axios.get(`${base_url}/submission/${submissionId}`);
        if (!mounted.current) return;
        const submission = response.data.submission;
        if (submission.status !== "Processing") {
          finish(submission.status === "Failure" ? "error" : "done", submission.output || "(no output)", file, startedAt);
        } else if (Date.now() - startedAt > MAX_WAIT_MS) {
          finish("error", "Timed out waiting for the result. The worker may be down.", file, startedAt);
        } else {
          pollBackend(submissionId, file, startedAt, Math.min(delay * 1.5, MAX_POLL_DELAY_MS));
        }
      } catch (err) {
        if (!mounted.current) return;
        finish("error", errorMessage(err, "Lost connection while waiting for output."), file, startedAt);
      }
    }, delay);
  }

  async function copyOutput() {
    try {
      await navigator.clipboard.writeText(res);
    } catch {
      return;
    }
    setCopied(true);
    setTimeout(() => mounted.current && setCopied(false), 1500);
  }

  function clearOutput() {
    setRes("");
    setStatus("idle");
    setRunInfo(null);
  }

  function resetCode() {
    if (code !== activeLang.starter && !confirm(`Replace your ${activeLang.label} code with the starter template?`)) return;
    setCode(activeLang.starter);
  }

  const lineCount = code.split("\n").length;

  return (
    <div className="h-screen overflow-hidden bg-[#0b0e14] text-[#e5e7eb] font-mono flex flex-col">
      {/* Title bar */}
      <div className="flex items-center justify-between border-b border-[#1f2530] bg-[#0e121a] px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5" aria-hidden>
            <span className="h-3 w-3 rounded-full bg-[#f87171]/70" />
            <span className="h-3 w-3 rounded-full bg-[#fbbf24]/70" />
            <span className="h-3 w-3 rounded-full bg-[#34d399]/70" />
          </div>
          <span className="ml-3 text-sm tracking-wide text-[#8b93a1]">code-runner</span>
        </div>

        {/* Language tabs */}
        <div className="flex" role="tablist" aria-label="Language">
          {LANGUAGES.map((l) => (
            <button
              key={l.id}
              role="tab"
              aria-selected={lang === l.id}
              onClick={() => {
                setLang(l.id);
                setCursor({ line: 1, column: 1 });
              }}
              className="relative px-3 sm:px-4 py-1.5 text-sm transition-colors hover:text-[#e5e7eb]"
              style={{ color: lang === l.id ? "#e5e7eb" : "#6b7280" }}
            >
              {l.label}
              <span
                className="absolute left-2 right-2 -bottom-[13px] h-[2px] transition-opacity"
                style={{
                  backgroundColor: l.accent,
                  opacity: lang === l.id ? 1 : 0,
                }}
              />
            </button>
          ))}
        </div>
      </div>

      {/* Main split view */}
      <div className="flex flex-1 flex-col md:flex-row min-h-0">
        {/* Editor pane */}
        <div className="flex flex-1 flex-col min-h-0 min-w-0 border-b md:border-b-0 md:border-r border-[#1f2530]">
          <div className="flex items-center justify-between px-4 py-2 text-xs uppercase tracking-widest text-[#8b93a1] border-b border-[#1f2530] bg-[#0e121a]">
            <span>{activeLang.file}</span>
            <button
              onClick={resetCode}
              className="normal-case tracking-normal text-[#6b7280] transition-colors hover:text-[#e5e7eb]"
            >
              Reset to template
            </button>
          </div>
          <CodeEditor
            value={code}
            onChange={setCode}
            onRun={handleSubmit}
            onCursorChange={setCursor}
            indent={activeLang.indent}
            accent={activeLang.accent}
          />
          <div className="flex items-center justify-between border-t border-[#1f2530] bg-[#0e121a] px-4 py-2.5">
            <span className="text-xs text-[#6b7280]">⌘/Ctrl + Enter to run</span>
            <Button
              onClick={handleSubmit}
              disabled={status === "running" || !code.trim()}
              className="h-8 rounded-md px-4 text-sm font-medium disabled:opacity-40"
              style={{ backgroundColor: activeLang.accent, color: "#0b0e14" }}
            >
              {status === "running" ? "Running…" : "Run ▶"}
            </Button>
          </div>
        </div>

        {/* Output pane */}
        <div className="flex flex-1 flex-col min-h-0 md:max-w-[40%]">
          <div className="flex items-center justify-between gap-2 px-4 py-2 text-xs uppercase tracking-widest text-[#8b93a1] border-b border-[#1f2530] bg-[#0e121a]">
            <div className="flex items-center gap-2" aria-live="polite">
              <span
                className="h-2 w-2 rounded-full"
                style={{
                  backgroundColor: statusConfig[status].dot,
                  animation: statusConfig[status].pulse ? "pulse 1.2s ease-in-out infinite" : undefined,
                }}
              />
              <span>{statusConfig[status].label}</span>
              {runInfo && (
                <span className="normal-case tracking-normal text-[#6b7280]">
                  · {runInfo.file} · {runInfo.seconds.toFixed(2)}s
                </span>
              )}
            </div>
            <div className="flex gap-3 normal-case tracking-normal">
              <button
                onClick={copyOutput}
                disabled={!res}
                className="text-[#6b7280] transition-colors hover:text-[#e5e7eb] disabled:opacity-40 disabled:hover:text-[#6b7280]"
              >
                {copied ? "Copied" : "Copy"}
              </button>
              <button
                onClick={clearOutput}
                disabled={!res || status === "running"}
                className="text-[#6b7280] transition-colors hover:text-[#e5e7eb] disabled:opacity-40 disabled:hover:text-[#6b7280]"
              >
                Clear
              </button>
            </div>
          </div>
          <pre
            className="flex-1 overflow-auto whitespace-pre-wrap break-words p-4 text-sm leading-6"
            style={{ color: status === "error" ? "#fca5a5" : "#d1d5db" }}
          >
            {status === "idle" && !res && (
              <span className="text-[#4b5563]">
                Output will appear here.{"\n"}Note: reading input (stdin) isn't supported yet.
              </span>
            )}
            {res}
            {status === "running" && <span className="animate-pulse text-[#fbbf24]">▌</span>}
          </pre>
        </div>
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between border-t border-[#1f2530] bg-[#0e121a] px-4 py-1.5 text-xs text-[#6b7280]">
        <span>lang: {activeLang.label}</span>
        <span>
          Ln {cursor.line}, Col {cursor.column} · {lineCount} lines · {code.length} chars
        </span>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
      `}</style>
    </div>
  );
};

export { App };
