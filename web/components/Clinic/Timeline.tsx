/* eslint-disable @typescript-eslint/no-explicit-any */

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Ban, CheckCircle2, XCircle, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import {
  getRunDetail,
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
      return "border-emerald-500/30 bg-emerald-500/15 text-emerald-300";
    case "error":
      return "border-red-500/30 bg-red-500/15 text-red-200";
    case "running":
      return "border-sky-500/30 bg-sky-500/15 text-sky-200";
    case "pending":
      return "border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-[hsl(var(--muted-fg))]";
    case "cancelled":
      return "border-amber-500/30 bg-amber-500/15 text-amber-200";
    default:
      return "border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-[hsl(var(--muted-fg))]";
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
    case "running":
      return "border-sky-500/40";
    default:
      return "border-[hsl(var(--border))]";
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
    default:
      return null;
  }
}

function EventTypeIcon({ type }: { type: string }) {
  if (type === "done")
    return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />;
  if (type === "error") return <XCircle className="h-3.5 w-3.5 text-red-300" />;
  if (type === "cancelled")
    return <Ban className="h-3.5 w-3.5 text-amber-300" />;
  return null;
}

function eventPillClass(type: string) {
  switch (type) {
    case "done":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
    case "error":
      return "border-red-500/30 bg-red-500/10 text-red-200";
    case "cancelled":
      return "border-amber-500/30 bg-amber-500/10 text-amber-200";
    case "tool_call":
      return "border-sky-500/30 bg-sky-500/10 text-sky-200";
    case "tool_result":
      return "border-indigo-500/30 bg-indigo-500/10 text-indigo-200";
    default:
      return "border-[hsl(var(--border))] bg-[hsl(var(--panel))] text-[hsl(var(--fg))]";
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
    void loadRuns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

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

  async function loadRuns(selectId?: string) {
    try {
      setLoadingRuns(true);
      const res = await listRuns({
        limit: 50,
        offset: 0,
        status: statusFilter,
      });
      let items = res.items ?? [];
      if (statusFilter) items = items.filter((r) => r.status === statusFilter);

      setRuns(items);

      const nextSelected =
        selectId ?? selectedRunId ?? (items.length > 0 ? items[0].id : null);

      if (nextSelected) setSelectedRunId(nextSelected);
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
        }
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

  return (
    <div className="h-full">
      <div className="flex h-full gap-4">
        {/* Left: run list */}
        <div className="w-[360px] shrink-0 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-hidden">
          <div className="border-b border-[hsl(var(--border))] px-3 py-2 flex items-center justify-between">
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

          <div className="p-3 border-b border-[hsl(var(--border))] flex items-center justify-between gap-2">
            <span className="text-[11px] text-[hsl(var(--muted-fg))]">
              Status
            </span>
            <Select
              value={statusFilter}
              onChange={(v) => setStatusFilter(v)}
              options={options}
            />
          </div>

          <div className="max-h-[calc(100vh-12rem)] overflow-auto">
            {loadingRuns ? (
              <div className="p-3 text-[11px] text-[hsl(var(--muted-fg))]">
                Loading runs…
              </div>
            ) : runs.length === 0 ? (
              <div className="p-3 text-[11px] text-[hsl(var(--muted-fg))]">
                No runs found. Run an agent to see history appear here.
              </div>
            ) : (
              <ul className="divide-y divide-[hsl(var(--border))]">
                {runs.map((run) => {
                  const active = run.id === selectedRunId;
                  return (
                    <li key={run.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedRunId(run.id)}
                        className={[
                          "w-full text-left px-3 py-2 text-[12px] flex flex-col gap-1 hover:bg-[hsl(var(--muted))]",
                          active ? "bg-[hsl(var(--muted))]" : "",
                        ].join(" ")}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium truncate">{run.id}</span>

                          {/* ✅ Status chip with tiny icon */}
                          <span
                            className={[
                              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide border",
                              statusChipClass(run.status),
                            ].join(" ")}
                          >
                            <StatusChipIcon status={run.status} />
                            <span>{run.status}</span>
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-2 text-[11px] text-[hsl(var(--muted-fg))]">
                          <span className="truncate">
                            {run.model ?? "model: n/a"}
                          </span>
                          <span>
                            {new Date(run.created_at).toLocaleTimeString()}
                          </span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Right: detail */}
        <div className="flex-1 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
          {!selectedRunId ? (
            <div className="text-[12px] text-[hsl(var(--muted-fg))]">
              Select a run to view details.
            </div>
          ) : loadingDetail ? (
            <div className="text-[12px] text-[hsl(var(--muted-fg))]">
              Loading run detail…
            </div>
          ) : !detail ? (
            <div className="text-[12px] text-[hsl(var(--muted-fg))]">
              No detail found.
            </div>
          ) : (
            <div className="space-y-4">
              {/* ✅ Run detail header border colored by status */}
              <section
                className={[
                  "rounded-xl border bg-[hsl(var(--panel))] p-3",
                  detailHeaderBorderClass(detail.run.status),
                ].join(" ")}
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-[12px] font-semibold">Run</h2>

                  <div className="flex items-center gap-2">
                    {/* ✅ Retry button for error/cancelled */}
                    {canRetry && (
                      <Button
                        size="xs"
                        variant="outline"
                        disabled={retrying}
                        onClick={() => void handleRetry()}
                      >
                        {retrying ? "Retrying…" : "Retry"}
                      </Button>
                    )}

                    {/* ✅ Status chip with icon in detail card */}
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

                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-[hsl(var(--muted-fg))]">
                  <div>ID</div>
                  <div className="font-mono text-[hsl(var(--fg))]">
                    {detail.run.id}
                  </div>

                  <div>Provider</div>
                  <div className="text-[hsl(var(--fg))]">
                    {detail.run.provider ?? "—"}
                  </div>

                  <div>Model</div>
                  <div className="text-[hsl(var(--fg))]">
                    {detail.run.model ?? "—"}
                  </div>

                  <div>Tokens</div>
                  <div className="text-[hsl(var(--fg))]">
                    {detail.run.tokens_total ?? "—"}
                  </div>

                  <div>Cost</div>
                  <div className="text-[hsl(var(--fg))]">
                    {typeof detail.run.cost_estimate_usd === "number"
                      ? `$${detail.run.cost_estimate_usd.toFixed(6)}`
                      : "—"}
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--panel))] p-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-[12px] font-semibold mb-2">Events</h2>
                </div>

                {detail.events.length === 0 ? (
                  <div className="text-[11px] text-[hsl(var(--muted-fg))]">
                    No events recorded for this run.
                  </div>
                ) : (
                  <ul className="space-y-1.5 text-[11px] max-h-[60vh] overflow-auto pr-1">
                    {detail.events.map((e) => {
                      const isLastTerminal = lastTerminalEventId === e.id;
                      return (
                        <li
                          key={e.id}
                          ref={isLastTerminal ? terminalEventElRef : null}
                          className={[
                            "rounded-md px-3 py-2 border",
                            eventPillClass(e.type),
                          ].join(" ")}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              {/* ✅ Terminal icon */}
                              <EventTypeIcon type={e.type} />
                              <span className="font-mono text-[10px] uppercase">
                                {e.type}
                              </span>
                              {isLastTerminal && (
                                <span className="ml-1 text-[10px] text-[hsl(var(--muted-fg))]">
                                  (latest terminal)
                                </span>
                              )}
                            </div>

                            <span className="text-[10px] text-[hsl(var(--muted-fg))]">
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
