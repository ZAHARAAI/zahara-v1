"use client";

import { useCallback, useEffect, useRef, useState, KeyboardEvent } from "react";
import { Loader2, Square, SendHorizonal, Terminal } from "lucide-react";
import { useRunStore, useRunInputState } from "@/hooks/useRunStore";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const CHAR_SOFT_LIMIT = 2_000;
const MAX_ROWS = 5;

// ─────────────────────────────────────────────────────────────────────────────
// PromptInput
// ─────────────────────────────────────────────────────────────────────────────

interface PromptInputProps {
  agentId: string | null;
  agentStatus?: string | null;
}

export default function PromptInput({
  agentId,
  agentStatus,
}: PromptInputProps) {
  const { runStatus } = useRunInputState();
  const startRun = useRunStore((s) => s.startRun);
  const cancelRun = useRunStore((s) => s.cancelRun);

  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isRunning = runStatus === "running";
  const isPaused = agentStatus === "paused" || agentStatus === "retired";
  const isDisabled = !agentId || isPaused || isRunning;
  const overLimit = value.length > CHAR_SOFT_LIMIT;
  const nearLimit = value.length > CHAR_SOFT_LIMIT * 0.8;
  const canSubmit = !isDisabled && value.trim().length > 0;

  // Auto-resize
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const lh = parseFloat(getComputedStyle(el).lineHeight) || 20;
    const maxH = lh * MAX_ROWS + 16;
    el.style.height = `${Math.min(el.scrollHeight, maxH)}px`;
  }, [value]);

  // Re-focus after run ends
  useEffect(() => {
    if (runStatus === "done" || runStatus === "error") {
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [runStatus]);

  const handleSubmit = useCallback(() => {
    const prompt = value.trim();
    if (!prompt || isRunning || !agentId) return;
    setValue("");
    void startRun(agentId, prompt);
  }, [value, isRunning, agentId, startRun]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleSubmit();
      }
      if (e.key === "Escape") setValue("");
    },
    [handleSubmit],
  );

  const placeholder = !agentId
    ? "Select an agent to begin…"
    : isPaused
      ? `Agent is ${agentStatus}`
      : isRunning
        ? "Agent is running…"
        : "Type a prompt…  (⌘↵ to run)";

  // ── Border color based on state ────────────────────────────────────────────
  const borderClass = isRunning
    ? "border-accent/40 dark:border-accent/30 ring-1 ring-accent/15 dark:ring-accent/10"
    : overLimit
      ? "border-red-400 dark:border-red-500/60 ring-1 ring-red-400/20"
      : "border-border hover:border-border dark:hover:border-border focus-within:border-accent/60 dark:focus-within:border-accent/40 focus-within:ring-1 focus-within:ring-accent/10";

  return (
    <div className="shrink-0 border-t border-border bg-bg dark:bg-bg px-3 py-2.5">
      {/* Input card */}
      <div
        className={[
          "flex items-end gap-0 rounded-xl border transition-all duration-150",
          "bg-panel dark:bg-card",
          borderClass,
        ].join(" ")}
      >
        {/* Prefix glyph */}
        <div className="self-end pb-[9px] pl-3 pr-1 select-none shrink-0">
          {isRunning ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
          ) : (
            <Terminal
              className={[
                "h-3.5 w-3.5 transition-colors",
                canSubmit ? "text-accent" : "text-muted_fg/40",
              ].join(" ")}
            />
          )}
        </div>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => !isRunning && setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isDisabled}
          placeholder={placeholder}
          rows={1}
          className={[
            "flex-1 resize-none bg-transparent py-2 pr-1 pl-1.5",
            "font-mono text-[13px] leading-relaxed",
            "text-fg placeholder:text-muted_fg/40",
            "focus:outline-none",
            "disabled:cursor-not-allowed disabled:opacity-40",
          ].join(" ")}
          style={{ maxHeight: `${20 * MAX_ROWS + 16}px` }}
          aria-label="Agent prompt"
          spellCheck={false}
          autoComplete="off"
        />

        {/* Action button */}
        <div className="self-end pb-[7px] pr-[7px] shrink-0">
          {isRunning ? (
            <button
              type="button"
              onClick={() => void cancelRun()}
              title="Cancel run (stops streaming)"
              className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors
                bg-red-100 dark:bg-red-500/12
                hover:bg-red-200 dark:hover:bg-red-500/20
                text-red-500 dark:text-red-400
                border border-red-200 dark:border-red-500/20"
            >
              <Square className="h-3 w-3 fill-current" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              title="Run (⌘↵)"
              className={[
                "flex items-center justify-center w-7 h-7 rounded-lg transition-all",
                canSubmit
                  ? "bg-accent text-accent_fg shadow-sm shadow-accent/20 hover:opacity-90"
                  : "bg-muted text-muted_fg/40 cursor-not-allowed",
              ].join(" ")}
            >
              <SendHorizonal className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Footer row: keyboard hint + char counter */}
      <div className="flex items-center justify-between mt-1.5 px-0.5">
        <span className="font-mono text-[10px] text-muted_fg/35 dark:text-muted_fg/25">
          {agentId && !isRunning && !isPaused && "⌘↵  run  ·  esc  clear"}
        </span>
        {nearLimit && (
          <span
            className={[
              "font-mono text-[10px] tabular-nums",
              overLimit
                ? "text-red-500 dark:text-red-400"
                : "text-amber-600 dark:text-amber-400/70",
            ].join(" ")}
          >
            {value.length.toLocaleString()} / {CHAR_SOFT_LIMIT.toLocaleString()}
          </span>
        )}
      </div>
    </div>
  );
}
