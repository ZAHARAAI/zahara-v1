"use client";

import React, { useCallback, useEffect, useRef, useState, memo } from "react";
import { useRouter } from "next/navigation";
import {
  useRunStore,
  useRunEvents,
  useRunStatus,
  useRunSummaryState,
  type ConsoleEvent,
} from "@/hooks/useRunStore";
import { useBuildersStore } from "@/hooks/useBuildersStore";
import { XCircle, RotateCcw, Radio, WifiOff } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Payload helpers
// ─────────────────────────────────────────────────────────────────────────────

function safeJson(x: unknown): string {
  try {
    return JSON.stringify(x, null, 2);
  } catch {
    return String(x);
  }
}

function summarizeToolCall(payload: unknown): string {
  const p = payload as Record<string, unknown> | undefined;
  const tc =
    p?.tool_call ??
    (p?.tool_calls as unknown[])?.[0] ??
    p?.function_call ??
    p ??
    {};
  const fn = (tc as Record<string, unknown>)?.function ?? tc;
  const name =
    (fn as Record<string, unknown>)?.name ??
    (tc as Record<string, unknown>)?.name ??
    "tool";
  const args = (fn as Record<string, unknown>)?.arguments ?? "";
  const str = typeof args === "string" ? args : safeJson(args);
  const compact = str.replace(/\s+/g, " ").trim().slice(0, 160);
  return compact ? `${name}(${compact})` : `${name}()`;
}

function summarizeToolResult(payload: unknown): string {
  const p = payload as Record<string, unknown> | undefined;
  const tr = p?.tool_result ?? (p?.tool_results as unknown[])?.[0] ?? p ?? {};
  const name = (tr as Record<string, unknown>)?.name ?? "tool";
  const out =
    (tr as Record<string, unknown>)?.content ??
    (tr as Record<string, unknown>)?.output ??
    (tr as Record<string, unknown>)?.result ??
    "";
  const str = typeof out === "string" ? out : safeJson(out);
  return `${name} → ${str.slice(0, 180)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Event line styling — dual light/dark
// Each entry: "light classes dark:dark-classes" — all using token or Tailwind
// ─────────────────────────────────────────────────────────────────────────────

const LINE: Record<string, string> = {
  // User prompt line
  log_user: [
    "text-fg border-l-2 border-accent pl-3",
    "bg-accent/3 dark:bg-accent/5",
  ].join(" "),

  // System log line
  log_system: [
    "text-fg_secondary dark:text-muted_fg",
    "border-l-2 border-border dark:border-border/60 pl-3",
  ].join(" "),

  // Streaming token text
  token: [
    "text-fg dark:text-fg",
    "border-l-2 border-accent/30 dark:border-accent/25 pl-3",
  ].join(" "),

  // Tool call — amber
  tool_call: [
    "text-amber-700 dark:text-amber-300",
    "border-l-2 border-amber-400/40 dark:border-amber-400/30 pl-3",
    "bg-amber-500/3 dark:bg-amber-500/5",
  ].join(" "),

  // Tool result — sky
  tool_result: [
    "text-sky-700 dark:text-sky-300",
    "border-l-2 border-sky-500/40 dark:border-sky-400/30 pl-3",
    "bg-sky-500/3 dark:bg-sky-500/5",
  ].join(" "),

  // Error line
  error: [
    "text-red-600 dark:text-red-400",
    "border-l-2 border-red-400 dark:border-red-500/70 pl-3",
    "bg-red-500/3 dark:bg-red-500/5",
  ].join(" "),

  // Terminal done line
  done: [
    "text-accent font-medium",
    "border-l-2 border-accent pl-3",
    "bg-accent/3 dark:bg-accent/6",
  ].join(" "),

  // System meta line
  system: [
    "text-muted_fg/60 italic text-[11px]",
    "border-l-2 border-transparent pl-3",
  ].join(" "),
};

function getLineClass(evt: ConsoleEvent): string {
  if (evt.type === "log") {
    return evt.role === "user" ? LINE.log_user : LINE.log_system;
  }
  return LINE[evt.type] ?? LINE.log_system;
}

function getLabel(evt: ConsoleEvent): string {
  if (evt.type === "tool_call") return "▶  " + summarizeToolCall(evt.payload);
  if (evt.type === "tool_result")
    return "←  " + summarizeToolResult(evt.payload);
  if (evt.type === "done") return "✓  " + (evt.message || "Run completed");
  if (evt.type === "error") return "✕  " + evt.message;
  return evt.message;
}

// ─────────────────────────────────────────────────────────────────────────────
// ConsoleLine — memo'd; uses pre-formatted timestamp (BUG-13)
// ─────────────────────────────────────────────────────────────────────────────

const ConsoleLine = memo(function ConsoleLine({ evt }: { evt: ConsoleEvent }) {
  return (
    <div
      className={`flex gap-3 items-start py-[3px] rounded-sm ${getLineClass(evt)}`}
    >
      {/* Timestamp */}
      <span className="shrink-0 font-mono text-[10px] text-muted_fg/50 dark:text-muted_fg/40 mt-px select-none tabular-nums w-[70px]">
        [{evt.tsFormatted}]
      </span>

      {/* Content */}
      <span
        className={[
          "font-mono text-[12px] leading-relaxed wrap-break-word min-w-0 flex-1 select-text",
          evt.isStreaming
            ? "after:content-['▋'] after:ml-0.5 after:animate-pulse after:text-accent after:opacity-80"
            : "",
        ].join(" ")}
      >
        {getLabel(evt)}
      </span>
    </div>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Empty state
// ─────────────────────────────────────────────────────────────────────────────

function ConsoleEmpty({ agentId }: { agentId: string | null }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-2 select-none px-6">
      {/* Subtle grid decoration */}
      <div className="relative mb-4">
        <div className="w-12 h-12 rounded-xl border-2 border-dashed border-border flex items-center justify-center">
          <span className="font-mono text-xl text-muted_fg/30">_</span>
        </div>
      </div>
      <p className="font-mono text-[12px] text-muted_fg/60 text-center">
        {agentId ? "ready" : "no agent selected"}
      </p>
      {agentId && (
        <p className="font-mono text-[11px] text-muted_fg/35 text-center">
          type a prompt below to start a run
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Stall indicator
// ─────────────────────────────────────────────────────────────────────────────

function StallIndicator() {
  return (
    <div className="flex items-center gap-3 py-[3px] pl-3 border-l-2 border-border/50">
      <span className="w-[70px] shrink-0" />
      <span className="flex items-center gap-1.5 font-mono text-[11px] text-muted_fg/50">
        <WifiOff className="h-3 w-3" />
        waiting for agent
        <span className="flex gap-0.5 ml-1">
          {[0, 150, 300].map((d) => (
            <span
              key={d}
              className="w-1 h-1 rounded-full bg-muted_fg/40 animate-bounce"
              style={{ animationDelay: `${d}ms` }}
            />
          ))}
        </span>
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Replay banner
// ─────────────────────────────────────────────────────────────────────────────

function ReplayBanner({
  runId,
  onExit,
}: {
  runId: string;
  onExit: () => void;
}) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 shrink-0
      bg-amber-50 dark:bg-amber-500/8
      border-b border-amber-200 dark:border-amber-500/20"
    >
      <span className="font-mono text-[10px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-widest">
        replay
      </span>
      <span className="font-mono text-[10px] text-amber-600/60 dark:text-amber-400/50 truncate flex-1">
        {runId}
      </span>
      <button
        type="button"
        onClick={onExit}
        className="flex items-center gap-1 font-mono text-[10px]
          text-amber-600/70 dark:text-amber-400/60
          hover:text-amber-700 dark:hover:text-amber-300
          transition-colors"
      >
        <XCircle className="h-3 w-3" />
        exit replay
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RunSummaryFooter — useRunSummaryState (useShallow, BUG-9)
// ─────────────────────────────────────────────────────────────────────────────

function RunSummaryFooter({ agentId }: { agentId: string | null }) {
  const router = useRouter();
  const { runStatus, activeRun } = useRunSummaryState();

  if (
    runStatus !== "done" &&
    runStatus !== "error" &&
    runStatus !== "cancelled"
  )
    return null;

  const latency = activeRun?.latencyMs
    ? `${(activeRun.latencyMs / 1_000).toFixed(1)}s`
    : null;
  const cost =
    activeRun?.costEstimateUsd != null
      ? `${activeRun.costIsApproximate ? "~" : ""}$${activeRun.costEstimateUsd.toFixed(4)}`
      : null;
  const tokens = activeRun?.tokensTotal
    ? `${activeRun.tokensTotal.toLocaleString()} tok`
    : null;

  const isOk = runStatus === "done";

  function handleViewInClinic() {
    if (!activeRun?.runId) return;
    useBuildersStore.getState().setSelectedRunId(activeRun.runId);
    router.push(`/clinic?runId=${encodeURIComponent(activeRun.runId)}`);
  }

  return (
    <div
      className={[
        "flex items-center gap-3 px-4 py-2.5 border-t font-mono text-[11px] shrink-0",
        isOk
          ? "bg-accent/5 dark:bg-accent/8 border-accent/20 dark:border-accent/15 text-accent"
          : runStatus === "cancelled"
            ? "bg-muted/50 dark:bg-muted/30 border-border text-muted_fg"
            : "bg-red-50 dark:bg-red-500/6 border-red-200 dark:border-red-500/15 text-red-600 dark:text-red-400",
      ].join(" ")}
    >
      <span className="font-semibold">
        {isOk
          ? "✓ completed"
          : runStatus === "cancelled"
            ? "○ cancelled"
            : "✕ failed"}
      </span>
      <span className="w-px h-3 bg-current opacity-20" />
      <div className="flex items-center gap-3 text-current opacity-60">
        {latency && <span>{latency}</span>}
        {tokens && <span>{tokens}</span>}
        {cost && <span>{cost}</span>}
      </div>

      {/* View in Clinic CTA — always shown when run has an ID */}
      {activeRun?.runId && (
        <button
          type="button"
          onClick={handleViewInClinic}
          className="ml-auto flex items-center gap-1.5 opacity-70 hover:opacity-100 transition-opacity"
        >
          View in Clinic →
        </button>
      )}

      {runStatus === "error" && agentId && (
        <button
          type="button"
          onClick={() => {
            const s = useRunStore.getState();
            const r = s.runs.find((r) => r.runId === s.activeRun?.runId);
            if (r) void s.retryRun(r.runId);
          }}
          className={[
            "flex items-center gap-1.5",
            "text-red-500 dark:text-red-400",
            "hover:text-red-600 dark:hover:text-red-300",
            "transition-colors",
            activeRun?.runId ? "" : "ml-auto",
          ].join(" ")}
        >
          <RotateCcw className="h-3 w-3" />
          retry
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Console toolbar (header)
// ─────────────────────────────────────────────────────────────────────────────

function ConsoleToolbar({
  runStatus,
  eventsExist,
  replayMode,
}: {
  runStatus: string;
  eventsExist: boolean;
  replayMode: boolean;
}) {
  return (
    <div
      className="flex items-center gap-2.5 px-4 py-2 border-b border-border shrink-0
      bg-panel dark:bg-card"
    >
      {/* Traffic-light dots */}
      <span className="flex gap-1.5 shrink-0">
        <span
          className="w-2.5 h-2.5 rounded-full
          bg-rose-300 dark:bg-rose-500/60
          border border-rose-400/40 dark:border-rose-500/30"
        />
        <span
          className="w-2.5 h-2.5 rounded-full
          bg-amber-300 dark:bg-amber-500/60
          border border-amber-400/40 dark:border-amber-500/30"
        />
        <span
          className="w-2.5 h-2.5 rounded-full
          bg-emerald-300 dark:bg-emerald-500/60
          border border-emerald-400/40 dark:border-emerald-500/30"
        />
      </span>

      {/* Label */}
      <span className="font-mono text-[10px] text-muted_fg/60 dark:text-muted_fg/40 tracking-wider uppercase ml-1">
        console
      </span>

      {/* Live indicator */}
      {runStatus === "running" && (
        <span className="flex items-center gap-1.5 ml-1 font-mono text-[10px] text-accent">
          <Radio className="h-3 w-3 animate-pulse" />
          live
        </span>
      )}

      {/* Clear button */}
      {runStatus !== "running" && eventsExist && !replayMode && (
        <button
          type="button"
          onClick={() => useRunStore.getState().clearConsole()}
          className="ml-auto font-mono text-[10px]
            text-muted_fg/40 hover:text-muted_fg
            transition-colors"
        >
          clear
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main RunConsole
// ─────────────────────────────────────────────────────────────────────────────

interface RunConsoleProps {
  agentId: string | null;
  className?: string;
}

export default function RunConsole({
  agentId,
  className = "",
}: RunConsoleProps) {
  const events = useRunEvents();
  const runStatus = useRunStatus();
  const replayMode = useRunStore((s) => s.replayMode);
  const replayRunId = useRunStore((s) => s.replayRunId);
  const lastEventAt = useRunStore((s) => s.lastEventAt);
  const exitReplay = useRunStore((s) => s.exitReplay);

  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // BUG-8: must be state (not ref) so button actually mounts/unmounts
  const [atBottom, setAtBottom] = useState(true);

  // BUG-7: stall — only set state when value changes
  const [isStalled, setIsStalled] = useState(false);
  useEffect(() => {
    if (runStatus !== "running") {
      setIsStalled(false);
      return;
    }
    const t = setInterval(() => {
      const age = lastEventAt ? Date.now() - lastEventAt : Infinity;
      setIsStalled((prev) => {
        const next = age > 8_000;
        return next === prev ? prev : next;
      });
    }, 1_000);
    return () => clearInterval(t);
  }, [runStatus, lastEventAt]);

  // IntersectionObserver → updates state (BUG-8)
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => setAtBottom(e.isIntersecting),
      { threshold: 0.1 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // BUG-6: instant scroll, fires only when event count increases
  const prevLenRef = useRef(0);
  useEffect(() => {
    if (events.length === prevLenRef.current) return;
    prevLenRef.current = events.length;
    if (atBottom && scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "instant" as ScrollBehavior,
      });
    }
  }, [events, atBottom]);

  // Scroll on replay load
  useEffect(() => {
    if (!replayMode) return;
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    });
  }, [replayMode]);

  const jumpToBottom = useCallback(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
    setAtBottom(true);
  }, []);

  const isEmpty = events.length === 0 && runStatus === "idle" && !replayMode;

  return (
    <div
      className={`relative flex flex-col overflow-hidden
      bg-white dark:bg-card
      ${className}`}
    >
      {/* Toolbar */}
      <ConsoleToolbar
        runStatus={runStatus}
        eventsExist={events.length > 0}
        replayMode={replayMode}
      />

      {/* Replay banner */}
      {replayMode && replayRunId && (
        <ReplayBanner runId={replayRunId} onExit={exitReplay} />
      )}

      {/* Log body */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto min-h-0 px-4 py-3 space-y-px
          bg-white dark:bg-[#0c0e13]"
        style={{
          scrollbarWidth: "thin",
          scrollbarColor: "hsl(var(--border)) transparent",
        }}
      >
        {isEmpty ? (
          <ConsoleEmpty agentId={agentId} />
        ) : (
          <>
            {events.map((evt) => (
              <ConsoleLine key={evt.id} evt={evt} />
            ))}
            {runStatus === "running" && isStalled && <StallIndicator />}
          </>
        )}
        <div ref={sentinelRef} className="h-px w-full" />
      </div>

      {/* Summary footer */}
      <RunSummaryFooter agentId={agentId} />

      {/* Jump-to-bottom pill — BUG-8: now actually renders */}
      {runStatus === "running" && !atBottom && (
        <button
          type="button"
          onClick={jumpToBottom}
          className="absolute bottom-14 right-4 z-10 flex items-center gap-1.5
            font-mono text-[10px] font-medium
            px-2.5 py-1.5 rounded-full
            bg-accent text-accent_fg
            shadow-md shadow-accent/20
            hover:opacity-90 transition-opacity"
        >
          ↓ latest
        </button>
      )}
    </div>
  );
}
