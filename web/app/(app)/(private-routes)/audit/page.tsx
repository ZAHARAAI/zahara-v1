"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ClipboardList, Layers } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonBar } from "@/components/ui/SkeletonCard";
import { useDemoStore, useIsSeeded } from "@/hooks/useDemoStore";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { listAudit, type AuditLogItem } from "@/services/api";
import Link from "next/link";

const POLL_INTERVAL_MS = 15_000; // refresh every 15 s while page is visible

const typeOptions: [string, string][] = [
  ["", "All types"],
  // Agent lifecycle
  ["agent.created", "agent.created"],
  ["agent.updated", "agent.updated"],
  ["agent.deleted", "agent.deleted"],
  ["agent.spec_created", "agent.spec_created"],
  ["agent.killed", "agent.killed"],
  // Runs
  ["run.started", "run.started"],
  ["run.retried", "run.retried"],
  ["run.cancelled", "run.cancelled"],
  // Job 9 guardrail events
  ["tool.blocked", "tool.blocked"],
  ["runaway.stopped", "runaway.stopped"],
  ["budget.blocked", "budget.blocked"],
  // Auth
  ["user.login", "user.login"],
  ["user.registered", "user.registered"],
  // Provider keys
  ["provider_key.created", "provider_key.created"],
  ["provider_key.deleted", "provider_key.deleted"],
  // API keys
  ["apikey.created", "apikey.created"],
  ["apikey.deactivated", "apikey.deactivated"],
  ["apikey.deleted", "apikey.deleted"],
];

const entityTypeOptions: [string, string][] = [
  ["", "All entities"],
  ["run", "run"],
  ["agent", "agent"],
  ["provider_key", "provider_key"],
  ["api_key", "api_key"],
  ["user", "user"],
];

// Map event_type to a semantic color class
function eventTypePill(eventType: string) {
  if (eventType.startsWith("run.")) {
    return "bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-300";
  }
  if (eventType.startsWith("agent.")) {
    return "bg-purple-500/10 border-purple-500/20 text-purple-600 dark:text-purple-300";
  }
  if (eventType.startsWith("user.")) {
    return "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-300";
  }
  if (
    eventType.startsWith("provider_key.") ||
    eventType.startsWith("apikey.")
  ) {
    return "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-300";
  }
  // Job 9 guardrail events — red to signal a policy violation or safety stop
  if (
    eventType === "tool.blocked" ||
    eventType === "runaway.stopped" ||
    eventType === "budget.blocked"
  ) {
    return "bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-300";
  }
  return "bg-muted border-border text-muted_fg";
}

export default function AuditPage() {
  const [items, setItems] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);

  const [type, setType] = useState<string>("");
  const [entityType, setEntityType] = useState<string>("");
  const [entityId, setEntityId] = useState<string>("");

  const [cursor, setCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  // ── Refresh key: increment to force a reload from filters/visibility/poll ──
  const [refreshKey, setRefreshKey] = useState(0);

  // Keep a stable ref to the latest filter values for use in event listeners
  const filtersRef = useRef({ type, entityType, entityId, cursor });
  filtersRef.current = { type, entityType, entityId, cursor };

  const demoPhase = useDemoStore((s) => s.phase);
  const demoSeed = useDemoStore((s) => s.seed);
  // Warning fix: was using useDemoStore.getState().seedVersion during render —
  // reads once, never re-subscribes. useIsSeeded() subscribes reactively.
  const isSeeded = useIsSeeded();

  const canLoadMore = useMemo(() => !!nextCursor, [nextCursor]);

  async function loadPage(opts?: { reset?: boolean }) {
    const reset = opts?.reset ?? false;
    try {
      setLoading(true);
      const {
        type: t,
        entityType: et,
        entityId: eid,
        cursor: cur,
      } = filtersRef.current;
      const res = await listAudit({
        limit: 50,
        cursor: reset ? undefined : (cur ?? undefined),
        type: t || undefined,
        entity_type: et || undefined,
        entity_id: eid.trim() || undefined,
      });

      const newItems = res.items ?? [];
      setItems((prev) => (reset ? newItems : [...prev, ...newItems]));
      setNextCursor(res.next_cursor ?? null);
      setCursor(res.next_cursor ?? null);
    } catch (err: unknown) {
      toast.error((err as Error)?.message ?? "Failed to load audit logs");
    } finally {
      setLoading(false);
      setInitialLoad(false);
    }
  }

  // ── Load on filter change or manual refresh ─────────────────────────────
  useEffect(() => {
    setItems([]);
    setCursor(null);
    setNextCursor(null);
    setInitialLoad(true);
    void loadPage({ reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, entityType, refreshKey]);

  // ── Auto-refresh when the page becomes visible again ─────────────────────
  // Fixes the case where: user is on Audit → goes to Clinic → cancels a run
  // → comes back to Audit. Without this, the Next.js router cache or stale
  // React state means the cancel event never appears without a manual refresh.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        setRefreshKey((k) => k + 1);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  // ── Light polling while page is visible ───────────────────────────────────
  // Keeps the audit list fresh without the user having to click Refresh.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") {
        setRefreshKey((k) => k + 1);
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Audit</h1>
          <p className="text-sm text-muted_fg">
            Immutable log of all control-plane actions.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setRefreshKey((k) => k + 1)}
          disabled={loading}
        >
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <div className="text-[11px] text-muted_fg mb-1">Type</div>
            <Select value={type} onChange={setType} options={typeOptions} />
          </div>
          <div>
            <div className="text-[11px] text-muted_fg mb-1">Entity</div>
            <Select
              value={entityType}
              onChange={setEntityType}
              options={entityTypeOptions}
            />
          </div>
          <div>
            <div className="text-[11px] text-muted_fg mb-1">Entity ID</div>
            <div className="flex gap-2">
              <Input
                value={entityId}
                onChange={(e) => setEntityId(e.target.value)}
                placeholder="agent_... / run_..."
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => setRefreshKey((k) => k + 1)}
                disabled={loading}
              >
                Apply
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Event list */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {/* Skeleton on initial load */}
        {initialLoad && loading ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="p-4 space-y-2">
                <div className="flex items-center gap-3">
                  <SkeletonBar width="w-28" height="h-4" />
                  <SkeletonBar width="w-16" height="h-3" />
                </div>
                <SkeletonBar width="w-48" height="h-3" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          /* Empty state */
          <EmptyState
            icon={<ClipboardList className="h-5 w-5" />}
            title={
              type || entityType || entityId
                ? "No events match filters"
                : "No audit events yet"
            }
            description={
              type || entityType || entityId
                ? "Try clearing your filters to see all events."
                : "Run an agent to generate your first audit events. Every run, kill, and config change appears here."
            }
            action={
              !type && !entityType && !entityId ? (
                <div className="flex flex-col items-center gap-2">
                  {!isSeeded && (
                    <button
                      onClick={() => void demoSeed({ force: false })}
                      disabled={demoPhase === "seeding"}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
                    >
                      {demoPhase === "seeding" ? "Seeding…" : "Seed demo data"}
                    </button>
                  )}
                  <Link
                    href="/builders?v=vibe"
                    className="inline-flex items-center gap-1.5 text-sm text-muted_fg hover:text-fg transition-colors"
                  >
                    <Layers className="h-3.5 w-3.5" />
                    Go to Builders to run an agent →
                  </Link>
                </div>
              ) : undefined
            }
          />
        ) : (
          <div className="divide-y divide-border">
            {items.map((it) => (
              <div key={it.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    {/* Event type pill */}
                    <span
                      className={[
                        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium whitespace-nowrap shrink-0",
                        eventTypePill(it.event_type),
                      ].join(" ")}
                    >
                      {it.event_type}
                    </span>

                    <div className="min-w-0">
                      <div className="text-[12px] text-muted_fg">
                        {it.entity_type ? `${it.entity_type}` : "—"}
                        {it.entity_id ? (
                          <span className="font-mono ml-1 opacity-70">
                            {it.entity_id}
                          </span>
                        ) : (
                          ""
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="text-[11px] text-muted_fg whitespace-nowrap shrink-0">
                    {new Date(it.created_at).toLocaleString()}
                  </div>
                </div>

                {it.payload ? (
                  <pre
                    className="mt-2 max-h-40 overflow-auto rounded-xl border border-border bg-panel p-3 text-[11px] text-fg"
                    style={{
                      scrollbarWidth: "thin",
                      scrollbarColor: "hsl(var(--border)) transparent",
                    }}
                  >
                    {JSON.stringify(it.payload, null, 2)}
                  </pre>
                ) : null}
              </div>
            ))}
          </div>
        )}

        <div className="border-t border-border p-3 flex items-center justify-between">
          <div className="text-[11px] text-muted_fg">
            Showing {items.length} item{items.length !== 1 ? "s" : ""}
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={loading || !canLoadMore}
            onClick={() => void loadPage({ reset: false })}
          >
            {loading && !initialLoad
              ? "Loading…"
              : canLoadMore
                ? "Load more"
                : "No more"}
          </Button>
        </div>
      </div>
    </div>
  );
}
