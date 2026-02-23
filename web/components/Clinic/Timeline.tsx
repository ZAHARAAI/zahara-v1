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
} from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import {
  deleteRun,
  getRunDetail,
  getAgent,
  listRuns,
  startAgentRun,
  streamRun,
  type RunDetail,
  type RunEventDTO,
  type RunListItem,
} from "@/services/api";
import { useRunUIStore } from "@/hooks/useRunUIStore";

/**
 * Job 6 Clinic timeline
 *
 * - Left side: list of recent runs (/runs)
 * - Right side: details & events for the selected run (/runs/{id})
 *
 * Historical view (non-SSE): reads stored run + run_events from DB.
 */

const options: [string, string][] = [
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

/** Detail header border color */
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
      return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />;

    case "error":
      return <XCircle className="h-3.5 w-3.5 dark:text-red-300" />;

    case "cancelled":
      return <Ban className="h-3.5 w-3.5 text-amber-300" />;

    case "tool_call":
      return <Wrench className="h-3.5 w-3.5 text-sky-300" />;

    case "tool_result":
      return <Sparkles className="h-3.5 w-3.5 text-indigo-300" />;

    case "log":
      return <MessageSquare className="h-3.5 w-3.5 text-muted_fg" />;

    case "system":
      return <Info className="h-3.5 w-3.5 text-cyan-300" />;

    case "token":
      return <Activity className="h-3.5 w-3.5 text-purple-300" />;

    case "ping":
      // Usually invisible / non-intrusive
      return null;

    default:
      return null;
  }
}

function eventPillClass(type: string) {
  switch (type) {
    case "done":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-500 dark:text-emerald-200";

    case "error":
      return "border-red-500/30 bg-red-500/10 text-red-500 dark:text-red-200";

    case "cancelled":
      return "border-amber-500/30 bg-amber-500/10 text-amber-500 dark:text-amber-200";

    case "tool_call":
      return "border-sky-500/30 bg-sky-500/10 text-sky-500 dark:text-sky-200";

    case "tool_result":
      return "border-indigo-500/30 bg-indigo-500/10 text-indigo-500 dark:text-indigo-200";

    case "system":
      return "border-cyan-500/30 bg-cyan-500/10 text-cyan-500 dark:text-cyan-200";

    case "log":
      return "border-muted/30 bg-muted/10 text-muted_fg";

    case "token":
      // usually streamed inline, but safe if rendered
      return "border-purple-500/30 bg-purple-500/10 text-purple-500 dark:text-purple-200";

    case "ping":
      // heartbeat – should not visually distract
      return "border-transparent bg-transparent text-transparent";

    default:
      return "border-border bg-panel text-fg";
  }
}

function isTerminalEventType(t: string) {
  return t === "done" || t === "error" || t === "cancelled";
}

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

  // URL drill-down support: /clinic?runId=...
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Capture initial runId from URL (once), so we can auto-select it when loading runs.
  const initialRunIdRef = useRef<string | null>(null);
  if (initialRunIdRef.current === null) {
    initialRunIdRef.current = searchParams.get("runId");
  }

  const agentIdFromUrl = searchParams.get("agentId") ?? "";

  const [agentFilterLabel, setAgentFilterLabel] = useState<string>("");

  // Resolve agent name for the filter badge (best-effort)
  useEffect(() => {
    let alive = true;

    async function loadAgentLabel() {
      if (!agentIdFromUrl) {
        setAgentFilterLabel("");
        return;
      }
      try {
        const res = await getAgent(agentIdFromUrl);
        const name = res?.agent?.name ?? "";
        if (alive) setAgentFilterLabel(name || "");
      } catch {
        if (alive) setAgentFilterLabel("");
      }
    }

    void loadAgentLabel();
    return () => {
      alive = false;
    };
  }, [agentIdFromUrl]);

  const [retrying, setRetrying] = useState(false);

  // Used for auto-scrolling to terminal event
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

  // If the URL changes (e.g. user pasted a link), react to it.
  useEffect(() => {
    const rid = searchParams.get("runId");
    if (rid && rid !== selectedRunId) {
      setSelectedRunId(rid);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function setRunAndSyncUrl(id: string) {
    setSelectedRunId(id);

    // Keep other query params intact, just update runId.
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("runId", id);
    router.replace(`${pathname}?${sp.toString()}`);
  }

  useEffect(() => {
    if (!selectedRunId) return;

    async function loadDetail() {
      try {
        setLoadingDetail(true);
        const res = await getRunDetail(selectedRunId as string);
        setDetail(res);
      } catch (err: any) {
        console.error("Failed to load run detail", err);
        toast.error(err?.message ?? "Failed to load run detail");
      } finally {
        setLoadingDetail(false);
      }
    }

    void loadDetail();
  }, [selectedRunId]);

  // Auto-scroll to latest terminal event when detail changes
  const lastTerminalEventId = useMemo(() => {
    const evs = detail?.events ?? [];
    for (let i = evs.length - 1; i >= 0; i--) {
      if (isTerminalEventType(evs[i].type)) return evs[i].id;
    }
    return null;
  }, [detail]);

  useEffect(() => {
    if (!lastTerminalEventId) return;
    // allow DOM to paint
    requestAnimationFrame(() => {
      terminalEventElRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  }, [lastTerminalEventId]);

  const canRetry = useMemo(() => {
    const r = detail?.run;
    if (!r) return false;
    if (!(r.status === "error" || r.status === "cancelled")) return false;
    if (!r.agent_id) return false;
    if (!r.input) return false;
    return true;
  }, [detail]);

  async function loadRuns(selectId?: string, agentId?: string) {
    try {
      setLoadingRuns(true);
      const res = await listRuns({
        // Slightly higher so deep links (agents → clinic) are more likely to be included.
        limit: 200,
        offset: 0,
        status: statusFilter || "",
        agent_id: agentId,
      });
      const items = res.items ?? [];
      setRuns(items);

      const nextSelected =
        selectId ?? selectedRunId ?? (items.length > 0 ? items[0].id : null);

      if (nextSelected) setRunAndSyncUrl(nextSelected);
    } catch (err: any) {
      console.error("Failed to load runs", err);
      toast.error(err?.message ?? "Failed to load runs");
    } finally {
      setLoadingRuns(false);
    }
  }

  async function handleRetry() {
    if (!detail?.run) return;
    if (!canRetry) return;

    const old = detail.run;

    setRetrying(true);
    try {
      const res = await startAgentRun(old.agent_id!, {
        input: old.input!,
        source: "clinic",
        config: {
          surface: "clinic",
          retry_of: old.id,
          model: old.model,
          provider: old.provider,
        },
      });

      toast.success("Retry started");

      // Open BUILD modal from Clinic
      runUI.show("BUILD", "Retrying via Clinic…", { autoCloseMs: 1200 });

      // Stop any previous Clinic stream, then stream this new run
      clinicStopRef.current?.();
      clinicStopRef.current = streamRun(
        res.run_id,
        () => {
          // no-op: streamRun will still push to BuildModal via useRunUIStore
        },
        {
          autoCloseMs: 1200, // clinic default
          fadeMs: 180,
        },
      );

      // refresh runs and select the new run
      await loadRuns(res.run_id);
    } catch (err: any) {
      console.error("Retry failed", err);
      toast.error(err?.message ?? "Failed to retry run");
      runUI.setError(err?.message ?? "Failed to retry run");
    } finally {
      setRetrying(false);
    }
  }

  async function handleDeleteRun(id: string, idx: number) {
    try {
      deleteRun(id);
      const rest_items = runs.filter((r) => r.id !== id);
      setRuns(rest_items);

      if (selectedRunId === id) {
        const isLastItem = rest_items.length == idx;
        const nextSelected =
          rest_items.length > 0
            ? rest_items[isLastItem ? idx - 1 : idx].id
            : null;
        if (nextSelected) setRunAndSyncUrl(nextSelected);
      }
    } catch (err: any) {
      // console.error("Failed to delete run ", err);
      toast.error(err?.message ?? "Failed to delete run");
    }
  }

  return (
    <div className="h-full">
      <div className="flex h-full gap-4">
        {/* Left: run list */}
        <div className="w-[360px] shrink-0 rounded-2xl border border-border bg-card overflow-hidden">
          <div className="border-b border-border px-3 py-2 flex items-center justify-between">
            <div className="text-sm font-semibold">Clinic</div>
            <Button
              size="xs"
              variant="outline"
              onClick={() => void loadRuns()}
              disabled={loadingRuns}
            >
              Refresh
            </Button>
          </div>

          <div className="p-3 border-b border-border flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted_fg">
                Total: {runs.length}
              </span>

              {agentIdFromUrl ? (
                <div className="flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-1 text-[11px] text-muted_fg">
                  <span className="truncate max-w-[180px]">
                    Filtered: Agent {agentFilterLabel || agentIdFromUrl}
                  </span>
                  <button
                    type="button"
                    className="ml-1 rounded-full px-1 hover:bg-background"
                    onClick={() => {
                      const params = new URLSearchParams(
                        searchParams.toString(),
                      );
                      params.delete("agentId");
                      // keep runId if present (deep-link), remove empty query
                      const qs = params.toString();
                      router.replace(qs ? `${pathname}?${qs}` : pathname);
                    }}
                    aria-label="Clear agent filter"
                    title="Clear filter"
                  >
                    ✕
                  </button>
                </div>
              ) : null}
            </div>

            <Select
              value={statusFilter}
              onChange={(v) => setStatusFilter(v)}
              options={options}
            />
          </div>

          <div className="max-h-[calc(100vh-12rem)] overflow-auto">
            {loadingRuns ? (
              <div className="p-3 text-[11px] text-muted_fg">Loading runs…</div>
            ) : runs.length === 0 ? (
              <div className="p-3 text-[11px] text-muted_fg">
                No runs found. Run an agent to see history appear here.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {runs.map((run, idx) => {
                  const active = run.id === selectedRunId;
                  return (
                    <li
                      key={run.id}
                      className="flex justify-between gap-x-1 items-center"
                    >
                      <button
                        type="button"
                        onClick={() => setRunAndSyncUrl(run.id)}
                        className={`w-full text-left px-3 py-2 text-[12px] flex flex-col gap-1 hover:bg-muted ${
                          active ? "bg-muted" : ""
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium truncate">{run.id}</span>

                          {/* Status chip with tiny icon */}
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide border ${statusChipClass(
                              run.status,
                            )}`}
                          >
                            <StatusChipIcon status={run.status} />
                            <span>{run.status}</span>
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-2 text-[11px] text-muted_fg">
                          <span className="truncate">
                            {run.model ?? "model: --"}
                          </span>
                          <span>
                            {new Date(run.created_at).toLocaleTimeString()}
                          </span>
                        </div>
                      </button>

                      <button
                        onClick={() => {
                          handleDeleteRun(run.id, idx);
                        }}
                      >
                        <Trash2Icon className="h-5 w-5 text-red-500 dark:text-red-400 hover:text-red-300 " />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Right: detail */}
        <div className="flex-1 rounded-2xl border border-border bg-card p-4">
          {!selectedRunId ? (
            <div className="text-[12px] text-muted_fg">
              Select a run to view details.
            </div>
          ) : loadingDetail ? (
            <div className="text-[12px] text-muted_fg">Loading run detail…</div>
          ) : !detail ? (
            <div className="text-[12px] text-muted_fg">No detail found.</div>
          ) : (
            <div className="space-y-4">
              {/* Run detail header border colored by status */}
              <section
                className={`rounded-xl border bg-panel p-3 ${detailHeaderBorderClass(
                  detail.run.status,
                )}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-[12px] font-semibold">Run</h2>

                  <div className="flex items-center gap-2">
                    {/* Retry button for error/cancelled */}
                    {canRetry && (
                      <Button
                        size="xs"
                        disabled={retrying}
                        onClick={() => void handleRetry()}
                      >
                        {retrying ? "Retrying…" : "Retry"}
                      </Button>
                    )}

                    {/* Replay if run status success */}
                    {detail.run.status.toLowerCase() === "success" && (
                      <Button
                        size="xs"
                        // disabled={replaying}
                        // onClick={() => void handleReplay()}
                      >
                        {/* {replaying ? "Running..." : "Replay"} */}
                        Replay
                      </Button>
                    )}

                    {/* Status chip with icon in detail card */}
                    <span
                      className={[
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide border",
                        statusChipClass(detail.run.status),
                      ].join(" ")}
                    >
                      <StatusChipIcon status={detail.run.status} />
                      <span>{detail.run.status}</span>
                    </span>
                  </div>
                </div>

                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-muted_fg">
                  <div>ID</div>
                  <div className="font-mono text-fg">{detail.run.id}</div>

                  <div>Provider</div>
                  <div className="text-fg">{detail.run.provider ?? "—"}</div>

                  <div>Model</div>
                  <div className="text-fg">{detail.run.model ?? "—"}</div>

                  <div>Tokens</div>
                  <div className="text-fg">
                    {detail.run.tokens_total ?? "—"}
                  </div>

                  <div>Cost</div>
                  <div className="text-fg">
                    {typeof detail.run.cost_estimate_usd === "number"
                      ? `$${detail.run.cost_estimate_usd.toFixed(6)}`
                      : "—"}
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-border bg-panel p-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-[12px] font-semibold mb-2">Events</h2>
                </div>

                {detail.events.length === 0 ? (
                  <div className="text-[11px] text-muted_fg">
                    No events recorded for this run.
                  </div>
                ) : (
                  <ul className="space-y-1.5 text-[11px] max-h-[50vh] overflow-auto pr-1">
                    {detail.events.map((e) => {
                      const isLastTerminal = lastTerminalEventId === e.id;
                      return (
                        <li
                          key={e.id}
                          ref={isLastTerminal ? terminalEventElRef : null}
                          className={`rounded-md px-3 py-2 border ${eventPillClass(
                            e.type,
                          )}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              {/* Terminal icon */}
                              <EventTypeIcon type={e.type} />
                              <span className="font-mono text-[10px] uppercase">
                                {e.type}
                              </span>
                              {isLastTerminal && (
                                <span className="ml-1 text-[10px] text-muted_fg">
                                  (latest terminal)
                                </span>
                              )}
                            </div>

                            <span className="text-[10px] text-muted_fg">
                              {new Date(e.created_at).toLocaleTimeString()}
                            </span>
                          </div>

                          <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap wrap-break-word text-[10px]">
                            {JSON.stringify(e.payload ?? {}, null, 2)}
                          </pre>
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
