/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { Button } from "@/components/ui/Button";
import { listConnectors, patchConnector, testConnector } from "@/services/api";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type Connector = {
  id: string;
  name: string;
  enabled: boolean;
  status?: string;
};

export default function Panel() {
  const [items, setItems] = useState<Connector[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      const json = await listConnectors();
      setItems(json.connectors);
    } catch (e: any) {
      toast.error("Failed to load MCP connectors", { description: e.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const toggle = async (id: string, enabled: boolean) => {
    try {
      await patchConnector(id, enabled);
      toast.success(`${enabled ? "Enabled" : "Disabled"} ${id}`);
      await refresh();
    } catch (e: any) {
      toast.error("Toggle failed", { description: e.message });
    }
  };

  const test = async (id: string) => {
    try {
      const res = await testConnector(id);
      toast.success(`Test passed`, {
        description: `${id} (${res.latencyMs}ms)`,
      });
    } catch (e: any) {
      toast.error("Test failed", { description: e.message });
    }
  };

  if (loading) return <div className="p-3 text-sm">Loading connectors…</div>;

  return (
    <div className="h-full overflow-auto">
      <ul className="divide-y divide-[hsl(var(--border))]">
        {items.map((c) => (
          <li key={c.id} className="p-3 flex items-center justify-between">
            <div>
              <div className="font-medium">{c.name}</div>
              {c.status && (
                <div className="text-xs opacity-70">status: {c.status}</div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => test(c.id)}>
                Test
              </Button>
              <Button onClick={() => toggle(c.id, !c.enabled)}>
                {c.enabled ? "Disable" : "Enable"}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
