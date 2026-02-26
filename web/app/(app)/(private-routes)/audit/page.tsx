"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { listAudit, type AuditLogItem } from "@/services/api";

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

export default function AuditPage() {
  const [items, setItems] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(false);

  const [type, setType] = useState<string>("");
  const [entityType, setEntityType] = useState<string>("");
  const [entityId, setEntityId] = useState<string>("");

  const [cursor, setCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const canLoadMore = useMemo(() => !!nextCursor, [nextCursor]);

  async function loadPage(opts?: { reset?: boolean }) {
    const reset = opts?.reset ?? false;
    try {
      setLoading(true);
      const res = await listAudit({
        limit: 50,
        cursor: reset ? undefined : (cursor ?? undefined),
        type: type || undefined,
        entity_type: entityType || undefined,
        entity_id: entityId.trim() || undefined,
      });

      const newItems = res.items ?? [];
      setItems((prev) => (reset ? newItems : [...prev, ...newItems]));
      setNextCursor(res.next_cursor ?? null);
      setCursor(res.next_cursor ?? null);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  }

  // initial + when filters change
  useEffect(() => {
    setItems([]);
    setCursor(null);
    setNextCursor(null);
    void loadPage({ reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, entityType]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Audit</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void loadPage({ reset: true })}
          disabled={loading}
        >
          Refresh
        </Button>
      </div>

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
                onClick={() => void loadPage({ reset: true })}
                disabled={loading}
              >
                Apply
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="divide-y divide-border">
          {items.length === 0 ? (
            <div className="p-4 text-sm text-muted_fg">
              {loading ? "Loading…" : "No audit logs found."}
            </div>
          ) : (
            items.map((it) => (
              <div key={it.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">{it.event_type}</div>
                    <div className="text-[11px] text-muted_fg">
                      {it.entity_type ? `${it.entity_type}` : "—"}
                      {it.entity_id ? ` • ${it.entity_id}` : ""}
                    </div>
                  </div>
                  <div className="text-[11px] text-muted_fg whitespace-nowrap">
                    {new Date(it.created_at).toLocaleString()}
                  </div>
                </div>
                {it.payload ? (
                  <pre className="mt-2 max-h-60 overflow-auto rounded-xl border border-border bg-panel p-3 text-[11px] text-fg">
                    {JSON.stringify(it.payload, null, 2)}
                  </pre>
                ) : null}
              </div>
            ))
          )}
        </div>

        <div className="border-t border-border p-3 flex items-center justify-between">
          <div className="text-[11px] text-muted_fg">
            Showing {items.length} items
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={loading || !canLoadMore}
            onClick={() => void loadPage({ reset: false })}
          >
            {loading ? "Loading…" : canLoadMore ? "Load more" : "No more"}
          </Button>
        </div>
      </div>
    </div>
  );
}
