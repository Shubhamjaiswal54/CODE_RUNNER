import { useRef, type KeyboardEvent } from "react";

type CodeEditorProps = {
  value: string;
  onChange: (value: string) => void;
  onRun: () => void;
  onCursorChange: (position: { line: number; column: number }) => void;
  indent: string;
  accent: string;
};

const OPENERS = new Set(["{", "[", "(", ":"]);

// execCommand keeps the browser's undo history intact, which setting `value` directly would wipe.
function insertText(textarea: HTMLTextAreaElement, text: string, onChange: (value: string) => void) {
  if (!document.execCommand("insertText", false, text)) {
    textarea.setRangeText(text, textarea.selectionStart, textarea.selectionEnd, "end");
    onChange(textarea.value);
  }
}

export function CodeEditor({ value, onChange, onRun, onCursorChange, indent, accent }: CodeEditorProps) {
  const gutter = useRef<HTMLDivElement>(null);
  const lineCount = value.split("\n").length;

  function reportCursor(textarea: HTMLTextAreaElement) {
    const before = textarea.value.slice(0, textarea.selectionStart);
    const line = before.split("\n").length;
    const column = before.length - before.lastIndexOf("\n");
    onCursorChange({ line, column });
  }

  function indentLines(textarea: HTMLTextAreaElement, outdent: boolean) {
    const { selectionStart, selectionEnd } = textarea;
    const blockStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
    const block = value.slice(blockStart, selectionEnd);
    const lines = block.split("\n");
    const changed = lines.map((line) => {
      if (!outdent) return indent + line;
      const leading = line.match(/^[ \t]*/)![0];
      return line.slice(Math.min(leading.length, indent.length));
    });

    const firstLineDelta = changed[0]!.length - lines[0]!.length;
    textarea.setSelectionRange(blockStart, selectionEnd);
    insertText(textarea, changed.join("\n"), onChange);
    textarea.setSelectionRange(
      Math.max(blockStart, selectionStart + firstLineDelta),
      blockStart + changed.join("\n").length,
    );
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    const textarea = e.currentTarget;

    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      onRun();
      return;
    }

    if (e.key === "Tab") {
      e.preventDefault();
      const multiLine = value.slice(textarea.selectionStart, textarea.selectionEnd).includes("\n");
      if (e.shiftKey || multiLine) indentLines(textarea, e.shiftKey);
      else insertText(textarea, indent, onChange);
      return;
    }

    if (e.key === "Enter" && !e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      const lineStart = value.lastIndexOf("\n", textarea.selectionStart - 1) + 1;
      const currentIndent = value.slice(lineStart).match(/^[ \t]*/)![0];
      const previousChar = value.slice(lineStart, textarea.selectionStart).trimEnd().slice(-1);
      insertText(textarea, "\n" + currentIndent + (OPENERS.has(previousChar) ? indent : ""), onChange);
    }
  }

  return (
    <div className="relative flex flex-1 min-h-0 overflow-hidden">
      <div
        ref={gutter}
        aria-hidden
        className="select-none overflow-hidden border-r border-[#1f2530] bg-[#0b0e14] pt-4 pb-10 pl-3 pr-3 text-right text-sm leading-6 text-[#4b5563]"
      >
        {Array.from({ length: lineCount }, (_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onSelect={(e) => reportCursor(e.currentTarget)}
        onScroll={(e) => {
          if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop;
        }}
        aria-label="Code editor"
        placeholder="// type your code here"
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        wrap="off"
        className="flex-1 resize-none overflow-auto bg-transparent p-4 font-mono text-sm leading-6 text-[#e5e7eb] outline-none placeholder:text-[#4b5563]"
        style={{ caretColor: accent, tabSize: indent.length }}
      />
    </div>
  );
}
