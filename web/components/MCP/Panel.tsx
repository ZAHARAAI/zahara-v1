/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { Button } from "@/components/ui/Button";
import {
  listConnectors,
  patchConnector,
  testConnector,
  type Connector,
} from "@/services/api";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export default function Panel() {
  const [items, setItems] = useState<Connector[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const list = await listConnectors();
        setItems(list);
      } catch (e: any) {
        toast.error("Failed to load connectors", { description: e.message });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const toggle = async (id: string, enabled: boolean) => {
    // optimistic UI update
    setItems((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              enabled,
              status: enabled ? "enabled" : "disabled",
            }
          : c
      )
    );
    try {
      await patchConnector(id, enabled);
      toast.success(`Connector ${enabled ? "enabled" : "disabled"}`);
    } catch (e: any) {
      // rollback on failure
      setItems((prev) =>
        prev.map((c) =>
          c.id === id
            ? {
                ...c,
                enabled: !enabled,
                status: !enabled ? "enabled" : "disabled",
              }
            : c
        )
      );
      toast.error("Toggle failed", { description: e.message });
    }
  };

  const test = async (id: string) => {
    try {
      const res = await testConnector(id);
      toast.success("Test OK", {
        description: `latency: ${res.latencyMs}ms`,
      });
    } catch (e: any) {
      toast.error("Test failed", { description: e.message });
    }
  };

  return (
    <div className="flex h-full flex-col bg-[hsl(var(--panel))]">
      <div className="border-b border-[hsl(var(--border))] px-3 py-2 text-xs font-medium">
        MCP Connectors
      </div>
      {loading && (
        <div className="p-3 text-xs opacity-70">Loading connectors…</div>
      )}
      <div className="flex-1 overflow-auto p-3 text-xs">
        {items.map((c) => (
          <div
            key={c.id}
            className="mb-2 flex items-center justify-between rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--bg))] px-3 py-2"
          >
            <div>
              <div className="font-medium">{c.name}</div>
              <div className="text-[10px] opacity-60">{c.id}</div>
              <div className="mt-0.5 text-[10px] opacity-60">
                status: {c.status ?? "unknown"}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="inline-flex items-center gap-1 text-[11px]">
                <input
                  type="checkbox"
                  checked={c.enabled}
                  onChange={(e) => toggle(c.id, e.target.checked)}
                />
                <span>{c.enabled ? "Enabled" : "Disabled"}</span>
              </label>
              <Button size="xs" variant="secondary" onClick={() => test(c.id)}>
                Test
              </Button>
            </div>
          </div>
        ))}
        {!loading && items.length === 0 && (
          <div className="text-xs opacity-60">
            No connectors found. Seed MCP connectors in the backend.
          </div>
        )}
      </div>
    </div>
  );
}
