"use client";

import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { toast } from "sonner";
import {
  startAgentRun,
  streamRun,
  listRuns,
  getRunDetail,
  retryRun as apiRetryRun,
  cancelRun as apiCancelRun,
  type RunEvent,
  type RunListItem,
} from "@/services/api";
import { useBuildersStore } from "@/hooks/useBuildersStore";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type RunStatus = "idle" | "running" | "done" | "error" | "cancelled";

export type ConsoleEventType =
  | "log"
  | "token"
  | "tool_call"
  | "tool_result"
  | "error"
  | "done"
  | "system"
  | "ping";

export interface ConsoleEvent {
  id: string;
  sequence: number;
  type: ConsoleEventType;
  ts: string;
  tsFormatted: string;
  message: string;
  role?: "user" | "assistant" | "system" | "tool";
  payload?: unknown;
  isStreaming?: boolean;
}

export interface RunRecord {
  runId: string;
  agentId: string;
  prompt: string;
  status: RunStatus;
  startedAt: number;
  endedAt?: number;
  tokensTotal?: number;
  tokensIn?: number;
  tokensOut?: number;
  costEstimateUsd?: number;
  costIsApproximate?: boolean;
  latencyMs?: number;
  errorMessage?: string;
  model?: string | null;
  provider?: string | null;
}

interface RunStoreState {
  runs: RunRecord[];
  runsAgentId: string | null;
  runsLoading: boolean;
  runsError: string | null;
  activeRun: RunRecord | null;
  runStatus: RunStatus;
  events: ConsoleEvent[];
  eventsRunId: string | null;
  _seq: number;
  lastEventAt: number | null;
  replayMode: boolean;
  replayRunId: string | null;
  replayLoading: boolean;

  startRun: (agentId: string, prompt: string) => Promise<void>;
  cancelRun: () => Promise<void>;
  retryRun: (runId: string) => Promise<void>;
  loadHistory: (agentId: string, opts?: { force?: boolean }) => Promise<void>;
  replayRun: (runId: string) => Promise<void>;
  exitReplay: () => void;
  clearConsole: () => void;
  resetForAgent: (agentId: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Module-level side-effect state
// Not in Zustand: non-serializable, never need to trigger React renders.
// ─────────────────────────────────────────────────────────────────────────────

let _activeStopStream: (() => void) | null = null;

let _submitting = false;

/** Abort for in-flight loadHistory calls (RC-5) */
let _historyAbort: AbortController | null = null;

const _cancelledRunIds = new Set<string>();

let _tokenBuffer = "";
let _tokenRafId: number | null = null;
let _tokenRunId: string | null = null;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function mapStatus(s: string): RunStatus {
  if (s === "success") return "done";
  if (s === "running" || s === "pending") return "running";
  if (s === "cancelled") return "cancelled";
  if (s === "error") return "error";
  return "idle";
}

function fmtTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return "--:--:--";
  }
}

function makeEvent(
  runId: string,
  seq: number,
  type: ConsoleEventType,
  ts: string,
  message: string,
  extra?: Partial<ConsoleEvent>,
): ConsoleEvent {
  return {
    id: `${runId}:${seq}`,
    sequence: seq,
    type,
    ts,
    tsFormatted: fmtTimestamp(ts),
    message,
    ...extra,
  };
}

const MAX_EVENTS = 500; // cap events[] to prevent unbounded growth
const RUN_HISTORY_LIMIT = 30;
const START_TIMEOUT_MS = 30_000;

const INIT: Omit<
  RunStoreState,
  | "startRun"
  | "cancelRun"
  | "retryRun"
  | "loadHistory"
  | "replayRun"
  | "exitReplay"
  | "clearConsole"
  | "resetForAgent"
> = {
  runs: [],
  runsAgentId: null,
  runsLoading: false,
  runsError: null,
  activeRun: null,
  runStatus: "idle",
  events: [],
  eventsRunId: null,
  _seq: 0,
  lastEventAt: null,
  replayMode: false,
  replayRunId: null,
  replayLoading: false,
};

// ─────────────────────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────────────────────

export const useRunStore = create<RunStoreState>((set, get) => ({
  ...INIT,

  // ── startRun ──────────────────────────────────────────────────────────────
  startRun: async (agentId, prompt) => {
    if (_submitting || get().runStatus === "running") return;
    _submitting = true;

    if (get().replayMode) set({ replayMode: false, replayRunId: null });

    _flushTokenBuffer(); // discard leftover tokens from any previous run

    const t0 = new Date().toISOString();
    const promptEvent = makeEvent("opt", 0, "log", t0, prompt, {
      role: "user",
    });

    set({
      runStatus: "running",
      events: [promptEvent],
      eventsRunId: null,
      _seq: 1,
      lastEventAt: Date.now(),
    });

    // ── Start timeout guard ───────────────────────────────────────────────
    // NOTE: startAgentRun goes through a Next.js Server Action ("use server"),
    // so client-side AbortSignals cannot be forwarded to the underlying fetch.
    // Instead we use a plain setTimeout that directly transitions to error state
    // if the POST hasn't resolved within START_TIMEOUT_MS.
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      // Only fire if we're still in the "waiting for run_id" phase
      if (useRunStore.getState().eventsRunId !== null) return;
      timedOut = true;
      _submitting = false;
      const now = new Date().toISOString();
      useRunStore.setState((s) => ({
        runStatus: "error",
        activeRun: null,
        events: [
          ...s.events,
          makeEvent(
            "err",
            s._seq,
            "error",
            now,
            "Request timed out — please retry",
          ),
        ],
        _seq: s._seq + 1,
      }));
      toast.error("Request timed out — please retry");
    }, START_TIMEOUT_MS);

    try {
      const res = await startAgentRun(agentId, {
        input: prompt,
        source: "vibe",
        config: { surface: "vibe", stream: true },
      });
      clearTimeout(timeoutId);

      // If timeout already fired while the await was resolving, bail out
      if (timedOut) return;

      const runId = res.run_id;

      if (res.budget && res.budget.percent_used >= 80) {
        toast.warning(
          `Budget ${res.budget.percent_used.toFixed(0)}% used — ` +
            `$${res.budget.spent_today_usd.toFixed(2)} / $${res.budget.budget_daily_usd.toFixed(2)}`,
        );
      }

      const record: RunRecord = {
        runId,
        agentId,
        prompt,
        status: "running",
        startedAt: Date.now(),
      };

      set((s) => ({
        activeRun: record,
        eventsRunId: runId,
        events: s.events.map((e) =>
          e.id === "opt:0" ? { ...e, id: `${runId}:0` } : e,
        ),
      }));

      useBuildersStore.getState().setActiveRun({
        runId,
        status: "running",
        startedAt: Date.now(),
        source: "vibe",
      });

      _tokenRunId = runId;
      _activeStopStream = streamRun(runId, (evt: RunEvent) =>
        _handleEvent(runId, evt),
      );
    } catch (err) {
      clearTimeout(timeoutId);
      if (timedOut) return; // timeout already handled the UI transition

      const raw = (err as Error).message ?? "Failed to start run";
      const code = (err as { code?: string }).code;

      const msg =
        code === "BUDGET_EXCEEDED"
          ? "Daily budget exceeded"
          : code === "AGENT_NOT_ACTIVE"
            ? "Agent is not active"
            : code === "CONCURRENT_RUN_LIMIT"
              ? "Another run is in progress"
              : raw.includes("BUDGET_EXCEEDED")
                ? "Daily budget exceeded"
                : raw.includes("AGENT_NOT_ACTIVE")
                  ? "Agent is not active"
                  : raw.includes("CONCURRENT_RUN_LIMIT")
                    ? "Another run is in progress"
                    : raw;

      const now = new Date().toISOString();
      set((s) => ({
        runStatus: "error",
        activeRun: null,
        events: [...s.events, makeEvent("err", s._seq, "error", now, msg)],
        _seq: s._seq + 1,
      }));
      toast.error(msg);
    } finally {
      _submitting = false;
    }
  },

  // ── cancelRun ─────────────────────────────────────────────────────────────
  cancelRun: async () => {
    if (get().runStatus === "cancelled") return;
    const { activeRun } = get();
    if (!activeRun) return;

    const runId = activeRun.runId;

    _cancelledRunIds.add(runId);

    _activeStopStream?.();
    _activeStopStream = null;
    _flushTokenBuffer(); // discard any buffered tokens from cancelled run

    set((s) => ({
      eventsRunId: null,
      runStatus: "cancelled",
      activeRun: s.activeRun
        ? { ...s.activeRun, status: "cancelled", endedAt: Date.now() }
        : null,
    }));

    useBuildersStore.getState().clearActiveRun();

    apiCancelRun(runId).catch((err) => {
      console.warn(
        "[useRunStore] cancel API failed (run continues on backend):",
        err,
      );
    });

    set((s) => ({
      runs: s.activeRun
        ? [
            {
              ...s.activeRun,
              status: "cancelled" as RunStatus,
              endedAt: Date.now(),
            },
            ...s.runs.filter((r) => r.runId !== s.activeRun!.runId),
          ].slice(0, RUN_HISTORY_LIMIT)
        : s.runs,
    }));
  },

  // ── retryRun ──────────────────────────────────────────────────────────────
  retryRun: async (runId) => {
    if (get().runStatus === "running") {
      toast.error("Wait for the current run to finish before retrying.");
      return;
    }
    const original = get().runs.find((r) => r.runId === runId);
    if (!original) return;

    try {
      const res = await apiRetryRun(runId);

      try {
        await get().replayRun(res.new_run_id);
      } catch {
        /* logged inside replayRun */
      }
      try {
        await get().loadHistory(original.agentId, { force: true });
      } catch {
        /* non-fatal */
      }
    } catch (err) {
      toast.error((err as Error).message ?? "Failed to retry run");
    }
  },

  // ── loadHistory ───────────────────────────────────────────────────────────
  loadHistory: async (agentId, opts) => {
    if (!opts?.force && get().runsAgentId === agentId && get().runs.length > 0)
      return;
    _historyAbort?.abort();
    _historyAbort = new AbortController();
    const signal = _historyAbort.signal;
    set({ runsLoading: true, runsError: null, runsAgentId: agentId });
    try {
      const res = await listRuns({
        agent_id: agentId,
        limit: RUN_HISTORY_LIMIT,
      });
      if (signal.aborted) return;
      const records: RunRecord[] = res.items.map((item: RunListItem) => ({
        runId: item.id,
        agentId: item.agent_id ?? agentId,
        prompt: "—",
        status: mapStatus(item.status),
        startedAt: new Date(item.created_at).getTime(),
        tokensTotal: item.tokens_total ?? undefined,
        costEstimateUsd: item.cost_estimate_usd ?? undefined,
        costIsApproximate: item.cost_is_approximate ?? undefined,
        latencyMs: item.latency_ms ?? undefined,
        model: item.model,
        provider: item.provider,
      }));
      set({ runs: records, runsLoading: false });
    } catch (err) {
      if (signal.aborted) return;
      set({
        runsError: (err as Error).message ?? "Failed to load history",
        runsLoading: false,
      });
    }
  },

  // ── replayRun ─────────────────────────────────────────────────────────────
  replayRun: async (runId) => {
    set({ replayLoading: true });
    try {
      const { events: raw } = await getRunDetail(runId);
      const events: ConsoleEvent[] = raw.map((e, i) =>
        makeEvent(
          runId,
          i,
          (e.type ?? "log") as ConsoleEventType,
          e.created_at,
          (e.payload?.message as string) ??
            (e.payload?.text as string) ??
            e.type,
          { payload: e.payload },
        ),
      );
      set({
        events,
        eventsRunId: runId,
        replayMode: true,
        replayRunId: runId,
        replayLoading: false,
      });
      useBuildersStore.getState().setSelectedRunId(runId);
    } catch (err) {
      set({ replayLoading: false });
      toast.error((err as Error).message ?? "Failed to load run details");
      throw err; // re-throw so retryRun can distinguish failure types
    }
  },

  exitReplay: () => {
    set({
      replayMode: false,
      replayRunId: null,
      events: [],
      eventsRunId: null,
    });
    useBuildersStore.getState().setSelectedRunId(null);
  },

  clearConsole: () =>
    set({
      events: [],
      eventsRunId: null,
      _seq: 0,
      replayMode: false,
      replayRunId: null,
    }),

  // ── resetForAgent ─────────────────────────────────────────────────────────
  resetForAgent: (agentId) => {
    _activeStopStream?.();
    _activeStopStream = null;
    _submitting = false;
    _flushTokenBuffer();

    set({ ...INIT, runsAgentId: agentId }); // set agentId so cache guard works immediately
  },
}));

// ─────────────────────────────────────────────────────────────────────────────
// Token buffer flush
// ─────────────────────────────────────────────────────────────────────────────

function _flushTokenBuffer(): void {
  if (_tokenRafId !== null) {
    cancelAnimationFrame(_tokenRafId);
    _tokenRafId = null;
  }
  if (!_tokenBuffer || !_tokenRunId) {
    _tokenBuffer = "";
    return;
  }

  const text = _tokenBuffer;
  const runId = _tokenRunId;
  _tokenBuffer = "";

  useRunStore.setState((s) => {
    if (s.eventsRunId !== runId) return {};
    const seq = s._seq;
    const last = s.events[s.events.length - 1];
    const ts = new Date().toISOString();

    if (last?.type === "token" && last.isStreaming) {
      return {
        events: [
          ...s.events.slice(0, -1),
          { ...last, message: last.message + text, isStreaming: true },
        ],
        _seq: seq + 1,
        lastEventAt: Date.now(),
      };
    }

    return {
      events: [
        ...s.events,
        makeEvent(runId, seq, "token", ts, text, {
          role: "assistant",
          isStreaming: true,
        }),
      ],
      _seq: seq + 1,
      lastEventAt: Date.now(),
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// _handleEvent
// ─────────────────────────────────────────────────────────────────────────────

function _handleEvent(runId: string, evt: RunEvent): void {
  if (evt.type === "ping") return;

  if (_cancelledRunIds.has(runId)) return;

  if (evt.type === "token") {
    const text =
      evt.message ?? (evt.payload as { text?: string } | undefined)?.text ?? "";
    _tokenBuffer += text;
    _tokenRunId = runId;
    if (_tokenRafId === null) {
      _tokenRafId = requestAnimationFrame(() => {
        _tokenRafId = null;
        _flushTokenBuffer();
      });
    }
    return;
  }

  // Non-token event: flush buffer first to preserve ordering
  _flushTokenBuffer();

  useRunStore.setState((s) => {
    if (s.eventsRunId !== runId) return {};

    const seq = s._seq;
    const ts = evt.ts ?? new Date().toISOString();
    const rawPayload = evt.payload as Record<string, unknown> | undefined;

    // Seal open token bubble
    const prevEvents =
      s.events.length > 0 && s.events[s.events.length - 1].isStreaming
        ? [
            ...s.events.slice(0, -1),
            { ...s.events[s.events.length - 1], isStreaming: false },
          ]
        : s.events;

    // Cap to prevent unbounded memory growth
    const cappedPrev =
      prevEvents.length >= MAX_EVENTS
        ? prevEvents.slice(prevEvents.length - (MAX_EVENTS - 1))
        : prevEvents;

    const newEvt = makeEvent(
      runId,
      seq,
      evt.type as ConsoleEventType,
      ts,
      evt.message ?? (rawPayload?.message as string) ?? evt.type,
      {
        payload: evt.payload,
        role:
          evt.type === "tool_call" || evt.type === "tool_result"
            ? "tool"
            : undefined,
      },
    );

    // Terminal events
    if (
      evt.type === "done" ||
      evt.type === "error" ||
      evt.type === "cancelled"
    ) {
      const termStatus: RunStatus =
        evt.type === "done"
          ? "done"
          : evt.type === "cancelled"
            ? "cancelled"
            : "error";

      const updated: RunRecord | null = s.activeRun
        ? {
            ...s.activeRun,
            status: termStatus,
            endedAt: Date.now(),
            tokensTotal: rawPayload?.tokens_total as number | undefined,
            tokensIn: rawPayload?.tokens_in as number | undefined,
            tokensOut: rawPayload?.tokens_out as number | undefined,
            costEstimateUsd: rawPayload?.cost_estimate_usd as
              | number
              | undefined,
            costIsApproximate: rawPayload?.cost_is_approximate as
              | boolean
              | undefined,
            latencyMs: rawPayload?.latency_ms as number | undefined,
            errorMessage:
              evt.type === "error" ? (evt.message ?? "Run failed") : undefined,
          }
        : null;

      _activeStopStream?.();
      _activeStopStream = null;

      if (termStatus === "done") useBuildersStore.getState().clearActiveRun();
      else
        useBuildersStore
          .getState()
          .setActiveRun((p) => (p ? { ...p, status: termStatus } : null));

      return {
        runStatus: termStatus,
        activeRun: updated,
        events: [...cappedPrev, newEvt],
        eventsRunId: null, // clear guard so future stale events are always dropped
        _seq: seq + 1,
        lastEventAt: Date.now(),
        runs: updated
          ? [updated, ...s.runs.filter((r) => r.runId !== updated.runId)].slice(
              0,
              RUN_HISTORY_LIMIT,
            )
          : s.runs,
      };
    }

    return {
      events: [...cappedPrev, newEvt],
      _seq: seq + 1,
      lastEventAt: Date.now(),
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Selector hooks
// ─────────────────────────────────────────────────────────────────────────────

export const useRunStatus = () => useRunStore((s) => s.runStatus);
export const useRunEvents = () => useRunStore((s) => s.events);
export const useRunHistory = () => useRunStore((s) => s.runs);
export const useReplayMode = () => useRunStore((s) => s.replayMode);
export const useRunActiveId = () =>
  useRunStore((s) => s.activeRun?.runId ?? null);

export const useRunInputState = () =>
  useRunStore(
    useShallow((s) => ({
      runStatus: s.runStatus,
      activeRunId: s.activeRun?.runId ?? null,
    })),
  );

export const useRunHistoryState = () =>
  useRunStore(
    useShallow((s) => ({
      runs: s.runs,
      runsLoading: s.runsLoading,
      runsError: s.runsError,
      activeRunId: s.activeRun?.runId ?? null,
      runStatus: s.runStatus,
      replayRunId: s.replayRunId,
    })),
  );

export const useRunSummaryState = () =>
  useRunStore(
    useShallow((s) => ({
      runStatus: s.runStatus,
      activeRun: s.activeRun,
    })),
  );
