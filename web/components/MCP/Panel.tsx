/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  listConnectors,
  McpConnector,
  patchConnector,
  testConnector,
} from "@/services/api";
import { useDemoStore, useIsSeeded } from "@/hooks/useDemoStore";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plug, Loader2 } from "lucide-react";

export default function Panel() {
  const [items, setItems] = useState<McpConnector[]>([]);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState<Record<string, boolean>>({});

  const demoPhase = useDemoStore((s) => s.phase);
  const demoSeed = useDemoStore((s) => s.seed);
  // Bug fix: was using useDemoStore.getState().seedVersion inside render —
  // that reads once and never re-subscribes. useIsSeeded() subscribes properly.
  const isSeeded = useIsSeeded();

  useEffect(() => {
    void load();
  }, []);

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

  const toggle = async (id: string, enabled: boolean) => {
    setItems((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, enabled, status: enabled ? "enabled" : "disabled" }
          : c,
      ),
    );
    try {
      await patchConnector(id, { enabled });
      toast.success(`Connector ${enabled ? "enabled" : "disabled"}`);
    } catch (e: any) {
      setItems((prev) =>
        prev.map((c) =>
          c.id === id
            ? {
                ...c,
                enabled: !enabled,
                status: !enabled ? "enabled" : "disabled",
              }
            : c,
        ),
      );
      toast.error("Toggle failed", { description: e.message });
    }
  };

  const test = async (id: string) => {
    setTesting((s) => ({ ...s, [id]: true }));
    try {
      const json = await testConnector({ connector_id: id });
      toast.success("Test OK", {
        description: `latency: ${json.latency_ms}ms`,
      });
      await load();
    } catch (e: any) {
      toast.error("Test failed", { description: e.message });
    } finally {
      setTesting((s) => ({ ...s, [id]: false }));
    }
  };

  return (
    <div className="flex h-full flex-col bg-panel">
      {/* Header */}
      <div className="border-b border-border px-4 py-3 flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">MCP Connectors</div>
          <div className="text-[11px] text-muted_fg mt-0.5">
            Model Context Protocol tool integrations
          </div>
        </div>
        <Button
          size="xs"
          variant="outline"
          onClick={() => void load()}
          disabled={loading}
          className="gap-1.5"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          {loading ? "Loading…" : "Refresh"}
        </Button>
      </div>

      {/* Body */}
      <div
        className="flex-1 overflow-auto p-3"
        style={{
          scrollbarWidth: "thin",
          scrollbarColor: "hsl(var(--border)) transparent",
        }}
      >
        {loading && items.length === 0 ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-16 rounded-xl border border-border bg-muted animate-pulse"
              />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Plug className="h-5 w-5" />}
            title="No MCP connectors"
            description="MCP connectors let your agents call external tools and APIs. Seed demo data to see examples."
            action={
              <div className="flex flex-col items-center gap-2">
                <button
                  onClick={() => void demoSeed({ force: false })}
                  disabled={demoPhase === "seeding"}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {demoPhase === "seeding" ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Seeding…
                    </>
                  ) : (
                    "Seed demo data"
                  )}
                </button>
                {isSeeded && (
                  <p className="text-[11px] text-muted_fg">
                    Demo seeded — connectors may take a moment to appear.
                  </p>
                )}
              </div>
            }
          />
        ) : (
          <div className="space-y-2">
            {items.map((c) => (
              <div
                key={c.id}
                className="rounded-xl border border-border bg-bg px-4 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">
                        {c.name}
                      </span>
                      <span
                        className={[
                          "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium border",
                          c.enabled
                            ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-600 dark:text-emerald-300"
                            : "bg-muted border-border text-muted_fg",
                        ].join(" ")}
                      >
                        {c.enabled ? "enabled" : "disabled"}
                      </span>
                    </div>

                    <div className="text-[11px] text-muted_fg font-mono mt-0.5 truncate">
                      {c.id}
                    </div>

                    {c.last_test_status && (
                      <div className="text-[11px] text-muted_fg mt-1">
                        Last test:{" "}
                        <span
                          className={
                            c.last_test_status === "ok"
                              ? "text-emerald-500"
                              : "text-red-400"
                          }
                        >
                          {c.last_test_status}
                        </span>
                        {c.last_test_at
                          ? ` · ${new Date(c.last_test_at).toLocaleString()}`
                          : ""}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => void test(c.id)}
                      disabled={!!testing[c.id]}
                      className="gap-1"
                    >
                      {testing[c.id] ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : null}
                      Test
                    </Button>

                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={c.enabled}
                        onChange={(e) => void toggle(c.id, e.target.checked)}
                      />
                      <div className="w-9 h-5 bg-muted border border-border rounded-full peer peer-checked:bg-accent peer-checked:border-accent transition-colors duration-200" />
                      <div className="absolute left-0.5 top-0.5 h-4 w-4 bg-white rounded-full shadow transition-transform duration-200 peer-checked:translate-x-4" />
                    </label>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
