import "./index.css";
import { Textarea } from "@/components/ui/textarea";
import { useState, useRef, useEffect } from "react";
import { Button } from "./components/ui/button";
import axios from "axios";

type Language = "js" | "py" | "c++";
type Status = "idle" | "running" | "done" | "error";

const LANGUAGES: { id: Language; label: string; accent: string }[] = [
  { id: "js", label: "JavaScript", accent: "#f0db4f" },
  { id: "py", label: "Python", accent: "#4b8bbe" },
  { id: "c++", label: "C++", accent: "#659ad2" },
];

const base_url = "http://localhost:5000";

const App = () => {
  const [lang, setLang] = useState<Language>("js");
  const [code, setCode] = useState("");
  const [res, setRes] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const pollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (pollTimeout.current) clearTimeout(pollTimeout.current);
    };
  }, []);

  async function handleSubmit() {
    if (!code.trim() || status === "running") return;
    setStatus("running");
    setRes("");
    try {
      const response = await axios.post(base_url, { lang, code });
      pollBackend(response.data.submissionId);
    } catch (err) {
      setStatus("error");
      setRes("Could not reach the runner. Is the server running?");
    }
  }

  async function pollBackend(submissionId: string) {
    try {
      const response = await axios.get(`${base_url}/submission/${submissionId}`);
      const submission = response.data.submission;
      if (submission.status !== "Processing") {
        setRes(submission.output);
        setStatus(submission.status === "Error" ? "error" : "done");
      } else {
        pollTimeout.current = setTimeout(() => pollBackend(submissionId), 1500);
      }
    } catch (err) {
      setStatus("error");
      setRes("Lost connection while waiting for output.");
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  }

  const activeLang = LANGUAGES.find((l) => l.id === lang)!;

  const statusConfig: Record<Status, { label: string; dot: string; pulse: boolean }> = {
    idle: { label: "Ready", dot: "#6b7280", pulse: false },
    running: { label: "Running…", dot: "#fbbf24", pulse: true },
    done: { label: "Finished", dot: "#34d399", pulse: false },
    error: { label: "Error", dot: "#f87171", pulse: false },
  };

  return (
    <div className="min-h-screen bg-[#0b0e14] text-[#e5e7eb] font-mono flex flex-col">
      {/* Title bar */}
      <div className="flex items-center justify-between border-b border-[#1f2530] bg-[#0e121a] px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <span className="h-3 w-3 rounded-full bg-[#f87171]/70" />
            <span className="h-3 w-3 rounded-full bg-[#fbbf24]/70" />
            <span className="h-3 w-3 rounded-full bg-[#34d399]/70" />
          </div>
          <span className="ml-3 text-sm tracking-wide text-[#8b93a1]">code-runner</span>
        </div>

        {/* Language tabs */}
        <div className="flex">
          {LANGUAGES.map((l) => (
            <button
              key={l.id}
              onClick={() => setLang(l.id)}
              className="relative px-4 py-1.5 text-sm transition-colors"
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
        <div className="flex flex-1 flex-col border-b md:border-b-0 md:border-r border-[#1f2530]">
          <div className="flex items-center justify-between px-4 py-2 text-xs uppercase tracking-widest text-[#8b93a1] border-b border-[#1f2530] bg-[#0e121a]">
            <span>main.{lang === "c++" ? "cpp" : lang}</span>
            <span>{code.length} chars</span>
          </div>
          <Textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="// type your code here"
            spellCheck={false}
            className="flex-1 resize-none rounded-none border-0 bg-transparent p-4 font-mono text-sm text-[#e5e7eb] placeholder:text-[#4b5563] focus-visible:ring-0"
          />
          <div className="flex items-center justify-between border-t border-[#1f2530] bg-[#0e121a] px-4 py-2.5">
            <span className="text-xs text-[#6b7280]">⌘/Ctrl + Enter to run</span>
            <Button
              onClick={handleSubmit}
              disabled={status === "running" || !code.trim()}
              className="h-8 rounded-md px-4 text-sm font-medium disabled:opacity-40"
              style={{ backgroundColor: activeLang.accent, color: "#0b0e14" }}
            >
              {status === "running" ? "Running" : "Run ▶"}
            </Button>
          </div>
        </div>

        {/* Output pane */}
        <div className="flex flex-1 flex-col md:max-w-[40%]">
          <div className="flex items-center gap-2 px-4 py-2 text-xs uppercase tracking-widest text-[#8b93a1] border-b border-[#1f2530] bg-[#0e121a]">
            <span
              className="h-2 w-2 rounded-full"
              style={{
                backgroundColor: statusConfig[status].dot,
                animation: statusConfig[status].pulse ? "pulse 1.2s ease-in-out infinite" : undefined,
              }}
            />
            <span>{statusConfig[status].label}</span>
          </div>
          <pre className="flex-1 overflow-auto whitespace-pre-wrap break-words p-4 text-sm text-[#d1d5db]">
            {res}
            {status === "running" && <span className="animate-pulse text-[#fbbf24]">▌</span>}
          </pre>
        </div>
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between border-t border-[#1f2530] bg-[#0e121a] px-4 py-1.5 text-xs text-[#6b7280]">
        <span>lang: {activeLang.label}</span>
        <span>utf-8 · lf</span>
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