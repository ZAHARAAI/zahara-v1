/* eslint-disable @typescript-eslint/no-explicit-any */

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Ban,
  CheckCircle2,
  XCircle,
  Loader2,
  Trash2Icon,
  Clock,
  Wrench,
  Sparkles,
  MessageSquare,
  Info,
  Activity,
  ChevronDown,
  ChevronRight,
  Download,
  RotateCcw,
  Play,
  Zap,
  DollarSign,
  Timer,
  Hash,
  AlertTriangle,
  Terminal,
} from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import {
  deleteRun,
  getRunDetail,
  getAgent,
  listRuns,
  retryRun,
  exportRunAsJson,
  streamRun,
  type RunDetail,
  type RunEventDTO,
  type RunListItem,
} from "@/services/api";
import { useRunUIStore } from "@/hooks/useRunUIStore";

const statusOptions: [string, string][] = [
  ["", "All statuses"],
  ["pending", "Pending"],
  ["running", "Running"],
  ["success", "Success"],
  ["error", "Error"],
  ["cancelled", "Cancelled"],
];

function statusChipClass(status: string) {
  switch (status) {
    case "success":
      return "border-emerald-500/30 bg-emerald-500/15 text-emerald-500 dark:text-emerald-300";
    case "error":
      return "border-red-500/30 bg-red-500/15 text-red-500 dark:text-red-200";
    case "running":
      return "border-sky-500/30 bg-sky-500/15 text-sky-500 dark:text-sky-200";
    case "pending":
      return "border-border bg-muted text-muted_fg";
    case "cancelled":
      return "border-amber-500/30 bg-amber-500/15 text-amber-500 dark:text-amber-200";
    default:
      return "border-border bg-muted text-muted_fg";
  }
}

function detailHeaderBorderClass(status: string) {
  switch (status) {
    case "success":
      return "border-emerald-500/40";
    case "error":
      return "border-red-500/40";
    case "cancelled":
      return "border-amber-500/40";
    case "pending":
      return "border-muted_fg/30";
    case "running":
      return "border-sky-500/40";
    default:
      return "border-border";
  }
}

function StatusChipIcon({ status }: { status: string }) {
  switch (status) {
    case "success":
      return <CheckCircle2 className="h-3 w-3" />;
    case "error":
      return <XCircle className="h-3 w-3" />;
    case "cancelled":
      return <Ban className="h-3 w-3" />;
    case "running":
      return <Loader2 className="h-3 w-3 animate-spin" />;
    case "pending":
      return <Clock className="h-3 w-3 text-muted_fg" />;
    default:
      return null;
  }
}

function EventTypeIcon({ type }: { type: string }) {
  switch (type) {
    case "done":
      return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />;
    case "error":
      return <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />;
    case "cancelled":
      return <Ban className="h-3.5 w-3.5 text-amber-400 shrink-0" />;
    case "tool_call":
      return <Wrench className="h-3.5 w-3.5 text-sky-400 shrink-0" />;
    case "tool_result":
      return <Sparkles className="h-3.5 w-3.5 text-indigo-400 shrink-0" />;
    case "log":
      return <MessageSquare className="h-3.5 w-3.5 text-muted_fg shrink-0" />;
    case "system":
      return <Info className="h-3.5 w-3.5 text-cyan-400 shrink-0" />;
    case "token":
      return <Activity className="h-3.5 w-3.5 text-purple-400 shrink-0" />;
    default:
      return <Terminal className="h-3.5 w-3.5 text-muted_fg shrink-0" />;
  }
}

function eventBorderClass(type: string) {
  switch (type) {
    case "done":
      return "border-emerald-500/25 bg-emerald-500/5";
    case "error":
      return "border-red-500/25 bg-red-500/5";
    case "cancelled":
      return "border-amber-500/25 bg-amber-500/5";
    case "tool_call":
      return "border-sky-500/25 bg-sky-500/5";
    case "tool_result":
      return "border-indigo-500/25 bg-indigo-500/5";
    case "system":
      return "border-cyan-500/25 bg-cyan-500/5";
    case "log":
      return "border-border/60 bg-muted/30";
    case "token":
      return "border-purple-500/20 bg-purple-500/5";
    default:
      return "border-border bg-panel";
  }
}

function eventLabelClass(type: string) {
  switch (type) {
    case "done":
      return "text-emerald-400";
    case "error":
      return "text-red-400";
    case "cancelled":
      return "text-amber-400";
    case "tool_call":
      return "text-sky-400";
    case "tool_result":
      return "text-indigo-400";
    case "system":
      return "text-cyan-400";
    case "token":
      return "text-purple-400";
    default:
      return "text-muted_fg";
  }
}

function isTerminalEventType(t: string) {
  return t === "done" || t === "error" || t === "cancelled";
}

function fmtLatency(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)}m`;
  if (ms >= 1_000) return `${(ms / 1_000).toFixed(2)}s`;
  return `${ms}ms`;
}

function fmtCost(
  usd: number | null | undefined,
  approx?: boolean | null,
): string {
  if (usd == null) return "—";
  const prefix = approx ? "~" : "";
  if (usd < 0.000001) return `${prefix}$0.00`;
  return `${prefix}$${usd.toFixed(6)}`;
}

// ─── Collapsible JSON ─────────────────────────────────────────────────────────

function CollapsibleJson({
  data,
  label,
  defaultOpen = false,
}: {
  data: any;
  label?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const str = useMemo(() => JSON.stringify(data, null, 2), [data]);
  if (!data || (typeof data === "object" && Object.keys(data).length === 0))
    return null;
  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-1 text-[10px] text-muted_fg hover:text-fg transition-colors"
      >
        {open ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        <span>{label ?? "payload"}</span>
      </button>
      {open && (
        <pre className="mt-1 max-h-48 overflow-auto rounded-md bg-black/20 px-3 py-2 text-[10px] text-fg/80 whitespace-pre-wrap break-all leading-relaxed">
          {str}
        </pre>
      )}
    </div>
  );
}

// ─── Event body renderers ─────────────────────────────────────────────────────

function ToolCallEvent({ payload }: { payload: any }) {
  const fnName = payload?.function?.name ?? payload?.name ?? "unknown_function";
  const rawArgs = payload?.function?.arguments ?? payload?.arguments;
  let parsedArgs: any = null;
  if (typeof rawArgs === "string") {
    try {
      parsedArgs = JSON.parse(rawArgs);
    } catch {
      parsedArgs = rawArgs;
    }
  } else if (rawArgs) {
    parsedArgs = rawArgs;
  }
  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono text-[11px] font-semibold text-sky-300">
          {fnName}
        </span>
        {payload?.id && (
          <span className="font-mono text-[9px] text-muted_fg bg-muted/50 px-1.5 py-0.5 rounded">
            {payload.id}
          </span>
        )}
      </div>
      {parsedArgs !== null && (
        <CollapsibleJson data={parsedArgs} label="arguments" defaultOpen />
      )}
    </div>
  );
}

function ToolResultEvent({ payload }: { payload: any }) {
  const callId = payload?.tool_call_id ?? payload?.call_id;
  const content = payload?.content ?? payload?.result ?? payload?.output;
  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={`text-[10px] font-medium ${payload?.is_error ? "text-red-400" : "text-indigo-300"}`}
        >
          {payload?.is_error ? "Result (error)" : "Result"}
        </span>
        {callId && (
          <span className="font-mono text-[9px] text-muted_fg bg-muted/50 px-1.5 py-0.5 rounded">
            ← {callId}
          </span>
        )}
      </div>
      {content != null && (
        <CollapsibleJson
          data={typeof content === "string" ? { output: content } : content}
          label="output"
          defaultOpen
        />
      )}
    </div>
  );
}

function DoneEvent({ payload }: { payload: any }) {
  const output =
    payload?.output ??
    payload?.content ??
    payload?.response ??
    payload?.message;
  const tokensIn = payload?.tokens_in ?? payload?.prompt_tokens;
  const tokensOut = payload?.tokens_out ?? payload?.completion_tokens;
  const tokensTotal = payload?.tokens_total ?? payload?.total_tokens;
  const cost = payload?.cost_estimate_usd;
  const latency = payload?.latency_ms;
  return (
    <div className="space-y-1.5">
      {(tokensTotal != null || cost != null || latency != null) && (
        <div className="flex flex-wrap gap-3 text-[10px] text-muted_fg">
          {tokensTotal != null && (
            <span className="flex items-center gap-1">
              <Hash className="h-3 w-3" />
              {tokensIn != null && tokensOut != null
                ? `${tokensIn} → ${tokensOut} (${tokensTotal})`
                : `${tokensTotal} tokens`}
            </span>
          )}
          {latency != null && (
            <span className="flex items-center gap-1">
              <Timer className="h-3 w-3" />
              {fmtLatency(latency)}
            </span>
          )}
          {cost != null && (
            <span className="flex items-center gap-1 text-emerald-400">
              <DollarSign className="h-3 w-3" />${Number(cost).toFixed(6)}
            </span>
          )}
        </div>
      )}
      {output != null ? (
        <CollapsibleJson
          data={typeof output === "string" ? { response: output } : output}
          label="output"
          defaultOpen
        />
      ) : (
        <CollapsibleJson data={payload} label="payload" defaultOpen={false} />
      )}
    </div>
  );
}

function ErrorEvent({ payload }: { payload: any }) {
  const message =
    payload?.message ?? payload?.error ?? payload?.detail ?? payload?.msg;
  const code = payload?.code ?? payload?.type;
  return (
    <div className="space-y-1">
      {message ? (
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-red-300 wrap-break-word">
            {String(message)}
          </p>
        </div>
      ) : (
        <CollapsibleJson data={payload} label="payload" defaultOpen />
      )}
      {code && (
        <span className="inline-block font-mono text-[9px] text-red-400/70 bg-red-500/10 px-1.5 py-0.5 rounded">
          {code}
        </span>
      )}
    </div>
  );
}

function LogEvent({ payload }: { payload: any }) {
  const message =
    payload?.message ?? payload?.msg ?? payload?.text ?? payload?.log;
  const level = payload?.level ?? "info";
  const levelColor =
    level === "error" || level === "warning"
      ? "text-amber-400"
      : level === "debug"
        ? "text-muted_fg"
        : "text-fg/80";
  return message ? (
    <p className={`text-[11px] leading-relaxed ${levelColor}`}>
      {String(message)}
    </p>
  ) : (
    <CollapsibleJson data={payload} label="payload" defaultOpen={false} />
  );
}

function SystemEvent({ payload }: { payload: any }) {
  const event = payload?.event ?? payload?.type;
  const msg = payload?.message ?? payload?.msg;
  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap">
        {event && (
          <span className="font-mono text-[10px] text-cyan-300">{event}</span>
        )}
        {msg && <span className="text-[11px] text-muted_fg">{msg}</span>}
      </div>
      <CollapsibleJson
        data={event ? { ...payload, event: undefined } : payload}
        label="details"
        defaultOpen={false}
      />
    </div>
  );
}

function TokenEvent({ payload }: { payload: any }) {
  const delta = payload?.delta ?? payload?.token ?? payload?.text;
  const tokensIn = payload?.tokens_in;
  const tokensOut = payload?.tokens_out;
  const tokensTotal = payload?.tokens_total;
  return (
    <div className="flex flex-wrap gap-3 text-[10px] text-muted_fg">
      {delta && (
        <span className="text-purple-300 font-mono text-[10px] truncate max-w-xs">
          {String(delta).length > 80
            ? String(delta).slice(0, 80) + "…"
            : String(delta)}
        </span>
      )}
      {tokensTotal != null && (
        <span className="flex items-center gap-1">
          <Hash className="h-3 w-3" />
          {tokensIn != null && tokensOut != null
            ? `${tokensIn}↑ ${tokensOut}↓`
            : `${tokensTotal} tokens`}
        </span>
      )}
      {!delta && !tokensTotal && (
        <CollapsibleJson data={payload} label="payload" defaultOpen={false} />
      )}
    </div>
  );
}

function EventBody({ event }: { event: RunEventDTO }) {
  switch (event.type) {
    case "tool_call":
      return <ToolCallEvent payload={event.payload} />;
    case "tool_result":
      return <ToolResultEvent payload={event.payload} />;
    case "done":
      return <DoneEvent payload={event.payload} />;
    case "error":
      return <ErrorEvent payload={event.payload} />;
    case "log":
      return <LogEvent payload={event.payload} />;
    case "system":
      return <SystemEvent payload={event.payload} />;
    case "token":
      return <TokenEvent payload={event.payload} />;
    default:
      return (
        <CollapsibleJson
          data={event.payload}
          label="payload"
          defaultOpen={false}
        />
      );
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Timeline() {
  const [runs, setRuns] = useState<RunListItem[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{
    run: RunDetail;
    events: RunEventDTO[];
  } | null>(null);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | "">("");
  const runUI = useRunUIStore();
  const clinicStopRef = useRef<null | (() => void)>(null);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const initialRunIdRef = useRef<string | null>(null);
  if (initialRunIdRef.current === null) {
    initialRunIdRef.current = searchParams.get("runId");
  }

  const agentIdFromUrl = searchParams.get("agentId") ?? "";
  const [agentFilterName, setAgentFilterName] = useState<string>("");
  const [loadingAgentFilterName, setLoadingAgentFilterName] = useState(false);

  const [retrying, setRetrying] = useState(false);
  const [replaying, setReplaying] = useState(false);
  const [exporting, setExporting] = useState(false);

  const terminalEventElRef = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    return () => {
      clinicStopRef.current?.();
      clinicStopRef.current = null;
    };
  }, []);

  useEffect(() => {
    void loadRuns(
      initialRunIdRef.current ?? undefined,
      agentIdFromUrl || undefined,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, agentIdFromUrl]);

  useEffect(() => {
    if (!agentIdFromUrl) {
      setAgentFilterName("");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setLoadingAgentFilterName(true);
        const res = await getAgent(agentIdFromUrl);
        if (!cancelled) setAgentFilterName(res?.agent?.name ?? "");
      } catch {
        if (!cancelled) setAgentFilterName("");
      } finally {
        if (!cancelled) setLoadingAgentFilterName(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agentIdFromUrl]);

  useEffect(() => {
    const rid = searchParams.get("runId");
    if (rid && rid !== selectedRunId) setSelectedRunId(rid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    if (!selectedRunId) return;
    (async () => {
      try {
        setLoadingDetail(true);
        setDetail(await getRunDetail(selectedRunId as string));
      } catch (err: any) {
        toast.error(err?.message ?? "Failed to load run detail");
      } finally {
        setLoadingDetail(false);
      }
    })();
  }, [selectedRunId]);

  const lastTerminalEventId = useMemo(() => {
    const evs = detail?.events ?? [];
    for (let i = evs.length - 1; i >= 0; i--) {
      if (isTerminalEventType(evs[i].type)) return evs[i].id;
    }
    return null;
  }, [detail]);

  useEffect(() => {
    if (!lastTerminalEventId) return;
    requestAnimationFrame(() => {
      terminalEventElRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  }, [lastTerminalEventId]);

  const canRetry = useMemo(() => {
    const r = detail?.run;
    return !!(
      r &&
      (r.status === "error" || r.status === "cancelled") &&
      r.agent_id &&
      r.input
    );
  }, [detail]);

  const canReplay = useMemo(() => {
    const r = detail?.run;
    return !!(r && r.status === "success" && r.agent_id && r.input);
  }, [detail]);

  const eventSummary = useMemo(() => {
    const evs = detail?.events ?? [];
    return {
      toolCalls: evs.filter((e) => e.type === "tool_call").length,
      toolResults: evs.filter((e) => e.type === "tool_result").length,
      logs: evs.filter((e) => e.type === "log").length,
      total: evs.filter((e) => e.type !== "ping").length,
    };
  }, [detail]);

  async function loadRuns(selectId?: string, agentId?: string) {
    try {
      setLoadingRuns(true);
      const res = await listRuns({
        limit: 50,
        offset: 0,
        status: statusFilter || "",
        agent_id: agentId,
      });
      const items = res.items ?? [];
      setRuns(items);
      const next =
        selectId ?? selectedRunId ?? (items.length > 0 ? items[0].id : null);
      if (next) setSelectedRunId(next);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to load runs");
    } finally {
      setLoadingRuns(false);
    }
  }

  async function fireRun(
    runId: string,
    label: string,
    setLoading: (b: boolean) => void,
  ) {
    setLoading(true);
    try {
      const res = await retryRun(runId);
      toast.success(`${label} started`);
      runUI.show("BUILD", `${label} via Clinic…`, { autoCloseMs: 1200 });
      clinicStopRef.current?.();
      clinicStopRef.current = streamRun(res.new_run_id, () => {}, {
        autoCloseMs: 1200,
        fadeMs: 180,
      });
      await loadRuns(res.new_run_id);
    } catch (err: any) {
      toast.error(err?.message ?? `Failed to ${label.toLowerCase()} run`);
      runUI.setError(err?.message ?? `Failed to ${label.toLowerCase()} run`);
    } finally {
      setLoading(false);
    }
  }

  async function handleExportJson() {
    if (!detail?.run?.id) return;
    setExporting(true);
    try {
      const payload = await exportRunAsJson(detail.run.id);
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `run_${detail.run.id}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Exported run JSON");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to export run");
    } finally {
      setExporting(false);
    }
  }

  async function handleDeleteRun(id: string, idx: number) {
    try {
      deleteRun(id);
      const rest = runs.filter((r) => r.id !== id);
      setRuns(rest);
      if (selectedRunId === id) {
        const isLast = rest.length === idx;
        const next = rest.length > 0 ? rest[isLast ? idx - 1 : idx].id : null;
        if (next) setSelectedRunId(next);
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to delete run");
    }
  }

  return (
    <div className="h-full">
      <div className="flex h-full gap-4">
        {/* ── Left: run list ── */}
        <div className="w-[340px] shrink-0 rounded-2xl border border-border bg-card overflow-hidden flex flex-col">
          <div className="border-b border-border px-3 py-2 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">Clinic</span>
              {agentIdFromUrl && (
                <span className="inline-flex items-center gap-2 rounded-full border border-border bg-panel px-2 py-0.5 text-[10px] text-muted_fg">
                  <span>
                    Agent:{" "}
                    <span className="text-fg">
                      {loadingAgentFilterName
                        ? "…"
                        : agentFilterName || agentIdFromUrl}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="text-muted_fg hover:text-fg"
                    onClick={() => {
                      const sp = new URLSearchParams(searchParams.toString());
                      sp.delete("agentId");
                      router.replace(`${pathname}?${sp.toString()}`);
                    }}
                  >
                    ✕
                  </button>
                </span>
              )}
            </div>
            <Button
              size="xs"
              variant="outline"
              onClick={() => void loadRuns()}
              disabled={loadingRuns}
            >
              Refresh
            </Button>
          </div>

          <div className="px-3 py-2 border-b border-border flex items-center justify-between gap-2 shrink-0">
            <span className="text-[11px] text-muted_fg">
              {runs.length} runs
            </span>
            <Select
              value={statusFilter}
              onChange={(v) => setStatusFilter(v)}
              options={statusOptions}
            />
          </div>

          <div className="flex-1 overflow-auto">
            {loadingRuns ? (
              <div className="p-3 text-[11px] text-muted_fg">Loading…</div>
            ) : runs.length === 0 ? (
              <div className="p-4 text-[11px] text-muted_fg">
                No runs found.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {runs.map((run, idx) => {
                  const active = run.id === selectedRunId;
                  return (
                    <li
                      key={run.id}
                      className={`group flex items-stretch ${active ? "bg-muted" : "hover:bg-muted/50"} transition-colors`}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedRunId(run.id)}
                        className="flex-1 text-left px-3 py-2.5 flex flex-col gap-1 min-w-0"
                      >
                        {/* Row 1: short id + status */}
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-[11px] text-fg truncate">
                            {run.id.length > 16
                              ? `…${run.id.slice(-14)}`
                              : run.id}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] uppercase tracking-wide border shrink-0 ${statusChipClass(run.status)}`}
                          >
                            <StatusChipIcon status={run.status} />
                            <span>{run.status}</span>
                          </span>
                        </div>
                        {/* Row 2: model + time */}
                        <div className="flex items-center justify-between gap-2 text-[10px] text-muted_fg">
                          <span className="truncate">{run.model ?? "—"}</span>
                          <span className="shrink-0">
                            {new Date(run.created_at).toLocaleTimeString()}
                          </span>
                        </div>
                        {/* Row 3: cost + latency */}
                        {(run.cost_estimate_usd != null ||
                          run.latency_ms != null) && (
                          <div className="flex items-center gap-2 text-[10px] text-muted_fg">
                            {run.cost_estimate_usd != null && (
                              <span className="flex items-center gap-0.5 text-emerald-500 dark:text-emerald-400">
                                <DollarSign className="h-2.5 w-2.5" />
                                {fmtCost(
                                  run.cost_estimate_usd,
                                  run.cost_is_approximate,
                                )}
                              </span>
                            )}
                            {run.latency_ms != null && (
                              <span className="flex items-center gap-0.5">
                                <Timer className="h-2.5 w-2.5" />
                                {fmtLatency(run.latency_ms)}
                              </span>
                            )}
                          </div>
                        )}
                      </button>
                      <button
                        type="button"
                        className="shrink-0 px-2 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => handleDeleteRun(run.id, idx)}
                        title="Delete run"
                      >
                        <Trash2Icon className="h-4 w-4 text-red-500 hover:text-red-300" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* ── Right: detail ── */}
        <div className="flex-1 min-w-0 rounded-2xl border border-border bg-card overflow-hidden flex flex-col">
          {!selectedRunId ? (
            <div className="flex-1 flex items-center justify-center text-[12px] text-muted_fg">
              Select a run to inspect it.
            </div>
          ) : loadingDetail ? (
            <div className="flex-1 flex items-center justify-center text-[12px] text-muted_fg">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
            </div>
          ) : !detail ? (
            <div className="flex-1 flex items-center justify-center text-[12px] text-muted_fg">
              No detail found.
            </div>
          ) : (
            <div className="flex-1 overflow-auto p-4 space-y-4">
              {/* Run header card */}
              <section
                className={`rounded-xl border bg-panel p-4 ${detailHeaderBorderClass(detail.run.status)}`}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide border ${statusChipClass(detail.run.status)}`}
                      >
                        <StatusChipIcon status={detail.run.status} />
                        <span>{detail.run.status}</span>
                      </span>
                      {detail.run.retry_of_run_id && (
                        <span className="text-[10px] text-muted_fg bg-muted/50 rounded-full px-2 py-0.5">
                          retry of …{detail.run.retry_of_run_id.slice(-8)}
                        </span>
                      )}
                      {detail.run.source && (
                        <span className="text-[10px] text-muted_fg bg-muted/50 rounded-full px-2 py-0.5 capitalize">
                          {detail.run.source}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 font-mono text-[10px] text-muted_fg">
                      {detail.run.id}
                    </p>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {canRetry && (
                      <Button
                        size="xs"
                        disabled={retrying}
                        onClick={() =>
                          void fireRun(detail.run.id, "Retry", setRetrying)
                        }
                      >
                        <RotateCcw className="h-3 w-3 mr-1" />
                        {retrying ? "Retrying…" : "Retry"}
                      </Button>
                    )}
                    {canReplay && (
                      <Button
                        size="xs"
                        disabled={replaying}
                        onClick={() =>
                          void fireRun(detail.run.id, "Replay", setReplaying)
                        }
                      >
                        <Play className="h-3 w-3 mr-1" />
                        {replaying ? "Replaying…" : "Replay"}
                      </Button>
                    )}
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={exporting}
                      onClick={() => void handleExportJson()}
                    >
                      <Download className="h-3 w-3 mr-1" />
                      {exporting ? "Exporting…" : "Export JSON"}
                    </Button>
                  </div>
                </div>

                {/* Metrics grid */}
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-muted_fg uppercase tracking-wide flex items-center gap-1">
                      <DollarSign className="h-3 w-3" />
                      Cost
                    </span>
                    <span className="text-[13px] font-semibold text-fg tabular-nums">
                      {fmtCost(
                        detail.run.cost_estimate_usd,
                        detail.run.cost_is_approximate,
                      )}
                      {detail.run.cost_is_approximate && (
                        <span className="ml-1 text-[10px] text-muted_fg font-normal">
                          (approx)
                        </span>
                      )}
                    </span>
                  </div>

                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-muted_fg uppercase tracking-wide flex items-center gap-1">
                      <Timer className="h-3 w-3" />
                      Latency
                    </span>
                    <span className="text-[13px] font-semibold text-fg tabular-nums">
                      {fmtLatency(detail.run.latency_ms)}
                    </span>
                  </div>

                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-muted_fg uppercase tracking-wide flex items-center gap-1">
                      <Hash className="h-3 w-3" />
                      Tokens
                    </span>
                    <span className="text-[13px] font-semibold text-fg tabular-nums">
                      {detail.run.tokens_total != null ? (
                        <>
                          {detail.run.tokens_total.toLocaleString()}
                          {detail.run.tokens_in != null &&
                            detail.run.tokens_out != null && (
                              <span className="ml-1 text-[10px] text-muted_fg font-normal">
                                ({detail.run.tokens_in}↑ {detail.run.tokens_out}
                                ↓)
                              </span>
                            )}
                        </>
                      ) : (
                        "—"
                      )}
                    </span>
                  </div>

                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-muted_fg uppercase tracking-wide flex items-center gap-1">
                      <Zap className="h-3 w-3" />
                      Provider
                    </span>
                    <span className="text-[12px] font-semibold text-fg capitalize">
                      {detail.run.provider ?? "—"}
                    </span>
                  </div>

                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-muted_fg uppercase tracking-wide">
                      Model
                    </span>
                    <span className="text-[12px] font-semibold text-fg font-mono truncate">
                      {detail.run.model ?? "—"}
                    </span>
                  </div>

                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-muted_fg uppercase tracking-wide flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Started
                    </span>
                    <span className="text-[11px] text-fg">
                      {new Date(detail.run.created_at).toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Error banner */}
                {detail.run.error_message && (
                  <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/8 px-3 py-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-red-300 wrap-break-word">
                      {detail.run.error_message}
                    </p>
                  </div>
                )}

                {/* Input */}
                {detail.run.input && (
                  <div className="mt-3">
                    <CollapsibleJson
                      data={(() => {
                        try {
                          return JSON.parse(detail.run.input);
                        } catch {
                          return { input: detail.run.input };
                        }
                      })()}
                      label="input"
                      defaultOpen={false}
                    />
                  </div>
                )}
              </section>

              {/* Events section */}
              <section className="rounded-xl border border-border bg-panel p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-[12px] font-semibold">Events</h2>
                  <div className="flex items-center gap-2 text-[10px] text-muted_fg">
                    <span>{eventSummary.total} events</span>
                    {eventSummary.toolCalls > 0 && (
                      <span className="flex items-center gap-1 text-sky-400">
                        <Wrench className="h-3 w-3" />
                        {eventSummary.toolCalls} calls
                      </span>
                    )}
                    {eventSummary.toolResults > 0 && (
                      <span className="flex items-center gap-1 text-indigo-400">
                        <Sparkles className="h-3 w-3" />
                        {eventSummary.toolResults} results
                      </span>
                    )}
                    {eventSummary.logs > 0 && (
                      <span className="flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" />
                        {eventSummary.logs} logs
                      </span>
                    )}
                  </div>
                </div>

                {detail.events.length === 0 ? (
                  <div className="text-[11px] text-muted_fg">
                    No events recorded for this run.
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {detail.events
                      .filter((e) => e.type !== "ping")
                      .map((e) => {
                        const isLastTerminal = lastTerminalEventId === e.id;
                        return (
                          <li
                            key={e.id}
                            ref={isLastTerminal ? terminalEventElRef : null}
                            className={`rounded-lg border px-3 py-2.5 ${eventBorderClass(e.type)}`}
                          >
                            <div className="flex items-center justify-between gap-2 mb-1.5">
                              <div className="flex items-center gap-2">
                                <EventTypeIcon type={e.type} />
                                <span
                                  className={`font-mono text-[10px] uppercase font-semibold tracking-wide ${eventLabelClass(e.type)}`}
                                >
                                  {e.type}
                                </span>
                                {isLastTerminal && (
                                  <span className="text-[9px] text-muted_fg bg-muted/50 rounded-full px-1.5 py-0.5">
                                    terminal
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-muted_fg shrink-0">
                                {new Date(e.created_at).toLocaleTimeString()}
                              </span>
                            </div>
                            <EventBody event={e} />
                          </li>
                        );
                      })}
                  </ul>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
