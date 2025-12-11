/* eslint-disable @typescript-eslint/no-explicit-any */

"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import {
  getRunDetail,
  listRuns,
  type RunDetailResponse,
  type RunListItem,
} from "@/services/job6";

/**
 * Job 6 Clinic timeline
 *
 * - Left side: list of recent runs (/runs)
 * - Right side: details & events for the selected run (/runs/{id})
 *
 * This intentionally does NOT use SSE – we read from the stored run + run_events
 * so that historical runs can be inspected long after they complete.
 */

const options: [string, string][] = [
  ["", "All statuses"],
  ["pending", "Pending"],
  ["running", "Running"],
  ["success", "Success"],
  ["error", "Error"],
];

export default function Timeline() {
  const [runs, setRuns] = useState<RunListItem[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [detail, setDetail] = useState<RunDetailResponse | null>(null);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | "">("");

  useEffect(() => {
    void loadRuns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  async function loadRuns() {
    try {
      setLoadingRuns(true);
      const res = await listRuns(50, 0);
      let items = res.items ?? [];
      if (statusFilter) {
        items = items.filter((r) => r.status === statusFilter);
      }
      setRuns(items);
      if (!selectedRunId && items.length > 0) {
        setSelectedRunId(items[0].id);
      }
    } catch (err: any) {
      console.error("Failed to load runs", err);
      toast.error(err?.message ?? "Failed to load runs");
    } finally {
      setLoadingRuns(false);
    }
  }

  useEffect(() => {
    if (!selectedRunId) return;
    void loadDetail(selectedRunId);
  }, [selectedRunId]);

  async function loadDetail(runId: string) {
    try {
      setLoadingDetail(true);
      const res = await getRunDetail(runId);
      setDetail(res);
    } catch (err: any) {
      console.error("Failed to load run detail", err);
      toast.error(err?.message ?? "Failed to load run detail");
    } finally {
      setLoadingDetail(false);
    }
  }

  const selectedRun = runs.find((r) => r.id === selectedRunId) ?? null;

  return (
    <div className="flex h-full">
      {/* Left pane: run list + filters */}
      <div className="w-80 border-r border-[hsl(var(--border))] bg-[hsl(var(--panel))] flex flex-col">
        <div className="border-b border-[hsl(var(--border))] p-3 flex items-center justify-between gap-2">
          <div className="text-[13px] font-medium">Runs</div>
          <Button
            size="xs"
            variant="outline"
            disabled={loadingRuns}
            onClick={() => loadRuns()}
          >
            Refresh
          </Button>
        </div>

        <div className="p-3 flex flex-col gap-2">
          <Select
            label="Status"
            value={statusFilter}
            onChange={(value) => setStatusFilter(value)}
            options={options}
          />
          <Input
            label="Search by run id"
            placeholder="run_..."
            onChange={(e) => {
              const value = e.target.value.trim();
              if (!value) {
                void loadRuns();
                return;
              }
              const exact = runs.find((r) => r.id === value);
              if (exact) {
                setSelectedRunId(exact.id);
              }
            }}
          />
        </div>

        <div className="flex-1 overflow-auto">
          {loadingRuns && runs.length === 0 ? (
            <div className="p-3 text-[12px] text-[hsl(var(--muted-fg))]">
              Loading runs…
            </div>
          ) : runs.length === 0 ? (
            <div className="p-3 text-[12px] text-[hsl(var(--muted-fg))]">
              No runs yet. Trigger runs from Vibe / Pro / Flow and they will
              appear here.
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
                        <span className="rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide">
                          {run.status}
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

      {/* Right pane: details */}
      <div className="flex-1 flex flex-col bg-[hsl(var(--bg))]">
        <div className="border-b border-[hsl(var(--border))] px-4 py-3 flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <div className="text-[13px] font-medium">
              {selectedRun ? selectedRun.id : "Run details"}
            </div>
            {selectedRun && (
              <div className="text-[11px] text-[hsl(var(--muted-fg))]">
                Status: {selectedRun.status} · Model:{" "}
                {selectedRun.model ?? "n/a"} · Latency:{" "}
                {selectedRun.latency_ms ?? 0}ms · Tokens:{" "}
                {selectedRun.tokens_total ?? 0} · Cost: $
                {(selectedRun.cost_estimate_usd ?? 0).toFixed(6)}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 overflow-auto px-4 py-3">
            {loadingDetail && (
              <div className="text-[12px] text-[hsl(var(--muted-fg))]">
                Loading run detail…
              </div>
            )}
            {!loadingDetail && !detail && (
              <div className="text-[12px] text-[hsl(var(--muted-fg))]">
                Select a run on the left to see details.
              </div>
            )}
            {!loadingDetail && detail && (
              <div className="space-y-4">
                <section>
                  <h2 className="text-[12px] font-semibold mb-2">Metadata</h2>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[11px]">
                    <span className="text-[hsl(var(--muted-fg))]">Run ID</span>
                    <span>{detail.run.id}</span>
                    <span className="text-[hsl(var(--muted-fg))]">
                      Agent ID
                    </span>
                    <span>{detail.run.agent_id ?? "—"}</span>
                    <span className="text-[hsl(var(--muted-fg))]">Status</span>
                    <span>{detail.run.status}</span>
                    <span className="text-[hsl(var(--muted-fg))]">Model</span>
                    <span>{detail.run.model ?? "—"}</span>
                    <span className="text-[hsl(var(--muted-fg))]">Source</span>
                    <span>{detail.run.source ?? "—"}</span>
                    <span className="text-[hsl(var(--muted-fg))]">Created</span>
                    <span>
                      {new Date(detail.run.created_at).toLocaleString()}
                    </span>
                    <span className="text-[hsl(var(--muted-fg))]">Updated</span>
                    <span>
                      {new Date(detail.run.updated_at).toLocaleString()}
                    </span>
                  </div>
                </section>

                <section>
                  <h2 className="text-[12px] font-semibold mb-2">Events</h2>
                  {detail.events.length === 0 ? (
                    <div className="text-[11px] text-[hsl(var(--muted-fg))]">
                      No events recorded for this run.
                    </div>
                  ) : (
                    <ul className="space-y-1.5 text-[11px]">
                      {detail.events.map((e) => (
                        <li
                          key={e.id}
                          className="rounded-md bg-[hsl(var(--panel))] px-3 py-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[10px] uppercase">
                              {e.type}
                            </span>
                            <span className="text-[10px] text-[hsl(var(--muted-fg))]">
                              {new Date(e.created_at).toLocaleTimeString()}
                            </span>
                          </div>
                          <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap wrap-break-word text-[10px]">
                            {JSON.stringify(e.payload ?? {}, null, 2)}
                          </pre>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
