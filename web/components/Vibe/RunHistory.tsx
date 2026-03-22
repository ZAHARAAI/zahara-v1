"use client";

import { useEffect, memo } from "react";
import {
  useRunStore,
  useRunHistoryState,
  type RunRecord,
  type RunStatus,
} from "@/hooks/useRunStore";
import {
  RotateCcw,
  Loader2,
  AlertCircle,
  Clock,
  CheckCircle2,
  XCircle,
  MinusCircle,
  RefreshCw,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function relativeTime(epochMs: number): string {
  const d = Date.now() - epochMs;
  if (d < 60_000) return `${Math.floor(d / 1_000)}s ago`;
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`;
  return new Date(epochMs).toLocaleDateString();
}

function shortId(id: string) {
  return id.slice(0, 8);
}

function fmtLatency(ms?: number) {
  if (ms == null) return "";
  return ms < 1_000 ? `${ms}ms` : `${(ms / 1_000).toFixed(1)}s`;
}

function fmtCost(usd?: number, approx?: boolean) {
  if (usd == null) return "";
  return `${approx ? "~" : ""}$${usd.toFixed(4)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Status icon — dual-mode colors
// ─────────────────────────────────────────────────────────────────────────────

function StatusIcon({ status, pulse }: { status: RunStatus; pulse?: boolean }) {
  const base = "h-3 w-3 shrink-0";
  if (status === "running")
    return (
      <span className={pulse ? "animate-pulse" : ""}>
        <Loader2 className={`${base} text-accent animate-spin`} />
      </span>
    );
  if (status === "done")
    return <CheckCircle2 className={`${base} text-accent`} />;
  if (status === "error")
    return <XCircle className={`${base} text-red-500 dark:text-red-400`} />;
  if (status === "cancelled")
    return <MinusCircle className={`${base} text-muted_fg/40`} />;
  return <Clock className={`${base} text-muted_fg/30`} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Status pill
// ─────────────────────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: RunStatus }) {
  const base =
    "inline-flex items-center px-1.5 py-px rounded text-[9px] font-mono font-medium border";
  if (status === "done")
    return (
      <span
        className={`${base} bg-accent/8 text-accent/90 border-accent/20 dark:bg-accent/12 dark:border-accent/25`}
      >
        done
      </span>
    );
  if (status === "error")
    return (
      <span
        className={`${base} bg-red-500/8 text-red-600 dark:text-red-400 border-red-500/20`}
      >
        error
      </span>
    );
  if (status === "running")
    return (
      <span
        className={`${base} bg-accent/10 text-accent border-accent/25 animate-pulse`}
      >
        running
      </span>
    );
  if (status === "cancelled")
    return (
      <span className={`${base} bg-muted text-muted_fg border-border`}>
        cancelled
      </span>
    );
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// RunRow
// ─────────────────────────────────────────────────────────────────────────────

interface RunRowProps {
  run: RunRecord;
  isActive: boolean;
  isReplaying: boolean;
  isRunning: boolean;
  onReplay: (id: string) => void;
  onRetry: (id: string) => void;
}

const RunRow = memo(function RunRow({
  run,
  isActive,
  isReplaying,
  isRunning,
  onReplay,
  onRetry,
}: RunRowProps) {
  const selected = isActive || isReplaying;

  return (
    <li className="relative">
      {/* Active accent line */}
      {selected && (
        <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-accent rounded-r-full" />
      )}

      <button
        type="button"
        onClick={() => !selected && onReplay(run.runId)}
        className={[
          "group w-full text-left px-3 py-2.5 transition-colors duration-100",
          "focus:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset",
          selected
            ? "bg-accent/5 dark:bg-accent/8"
            : "hover:bg-muted/60 dark:hover:bg-muted/40",
        ].join(" ")}
      >
        {/* Row 1: ID + time */}
        <div className="flex items-center gap-1.5 mb-1">
          <StatusIcon status={run.status} pulse={isActive} />
          <span className="font-mono text-[10px] text-muted_fg tabular-nums tracking-wide">
            {shortId(run.runId)}
          </span>
          <span className="ml-auto font-mono text-[10px] text-muted_fg/50 shrink-0">
            {relativeTime(run.startedAt)}
          </span>
        </div>

        {/* Row 2: prompt */}
        <div className="pl-[18px] mb-1.5">
          {run.prompt === "—" ? (
            <span className="font-mono text-[11px] text-muted_fg/30 italic">
              no prompt
            </span>
          ) : (
            <span className="font-mono text-[11px] text-fg/65 dark:text-fg/60 line-clamp-2 leading-tight">
              {run.prompt}
            </span>
          )}
        </div>

        {/* Row 3: metrics + status pill + retry */}
        <div className="flex items-center gap-1.5 pl-[18px]">
          <StatusPill status={run.status} />
          {fmtLatency(run.latencyMs) && (
            <span className="font-mono text-[10px] text-muted_fg/50">
              {fmtLatency(run.latencyMs)}
            </span>
          )}
          {fmtCost(run.costEstimateUsd, run.costIsApproximate) && (
            <span className="font-mono text-[10px] text-muted_fg/40">
              {fmtCost(run.costEstimateUsd, run.costIsApproximate)}
            </span>
          )}

          {/* Retry on hover — error rows only */}
          {run.status === "error" && (
            <button
              type="button"
              title="Retry"
              disabled={isRunning}
              onClick={(e) => {
                e.stopPropagation();
                onRetry(run.runId);
              }}
              className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity
                disabled:opacity-20 text-muted_fg/50 hover:text-fg"
            >
              <RotateCcw className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Error message */}
        {run.status === "error" && run.errorMessage && (
          <div className="mt-1 pl-[18px] flex items-start gap-1">
            <AlertCircle className="h-2.5 w-2.5 shrink-0 mt-px text-red-500 dark:text-red-400" />
            <span className="font-mono text-[10px] text-red-600 dark:text-red-400/70 line-clamp-2 leading-tight">
              {run.errorMessage}
            </span>
          </div>
        )}
      </button>
    </li>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton
// ─────────────────────────────────────────────────────────────────────────────

function HistorySkeleton() {
  return (
    <ul className="divide-y divide-border/50">
      {[72, 56, 80, 48].map((w, i) => (
        <li key={i} className="px-3 py-3 space-y-2 animate-pulse">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-muted_2" />
            <div
              className="h-2 rounded bg-muted_2"
              style={{ width: `${w}%` }}
            />
            <div className="ml-auto h-2 w-8 rounded bg-muted_2/70" />
          </div>
          <div
            className="h-2 rounded bg-muted_2/60 ml-[18px]"
            style={{ width: "65%" }}
          />
          <div className="flex gap-2 ml-[18px]">
            <div className="h-2 w-10 rounded bg-muted_2/50" />
            <div className="h-2 w-8 rounded bg-muted_2/40" />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RunHistory
// ─────────────────────────────────────────────────────────────────────────────

interface RunHistoryProps {
  agentId: string | null;
}

export default function RunHistory({ agentId }: RunHistoryProps) {
  const { runs, runsLoading, runsError, activeRunId, runStatus, replayRunId } =
    useRunHistoryState();

  const loadHistory = useRunStore((s) => s.loadHistory);
  const replayRun = useRunStore((s) => s.replayRun);
  const retryRun = useRunStore((s) => s.retryRun);
  const isRunning = runStatus === "running";

  useEffect(() => {
    if (agentId) void loadHistory(agentId);
  }, [agentId, loadHistory]);

  return (
    <div className="flex flex-col h-full bg-panel dark:bg-panel">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border shrink-0">
        <span className="font-mono text-[10px] font-semibold text-muted_fg uppercase tracking-widest">
          Run History
        </span>
        {agentId && (
          <button
            type="button"
            title="Refresh"
            onClick={() => void loadHistory(agentId, { force: true })}
            disabled={runsLoading}
            className="p-0.5 rounded text-muted_fg/50 hover:text-muted_fg transition-colors
              disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <RefreshCw
              className={`h-3 w-3 ${runsLoading ? "animate-spin" : ""}`}
            />
          </button>
        )}
      </div>

      {/* Body */}
      <div
        className="flex-1 overflow-y-auto divide-y divide-border/50"
        style={{
          scrollbarWidth: "thin",
          scrollbarColor: "hsl(var(--border)) transparent",
        }}
      >
        {!agentId ? (
          <EmptySlate text="No agent selected" />
        ) : runsLoading && runs.length === 0 ? (
          <HistorySkeleton />
        ) : runsError ? (
          <ErrorSlate
            message={runsError}
            onRetry={() => void loadHistory(agentId, { force: true })}
          />
        ) : runs.length === 0 ? (
          <EmptySlate text="No runs yet" />
        ) : (
          <ul>
            {runs.map((run) => (
              <RunRow
                key={run.runId}
                run={run}
                isActive={run.runId === activeRunId && isRunning}
                isReplaying={run.runId === replayRunId}
                isRunning={isRunning}
                onReplay={replayRun}
                onRetry={retryRun}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── Utility slates ────────────────────────────────────────────────────────────

function EmptySlate({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center py-12 px-4">
      <span className="font-mono text-[11px] text-muted_fg/40 text-center">
        {text}
      </span>
    </div>
  );
}

function ErrorSlate({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 px-4">
      <AlertCircle className="h-4 w-4 text-red-500 dark:text-red-400" />
      <p className="font-mono text-[10px] text-red-600 dark:text-red-400/80 text-center line-clamp-3">
        {message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="font-mono text-[10px] text-muted_fg hover:text-fg underline underline-offset-2 transition-colors"
      >
        retry
      </button>
    </div>
  );
}
