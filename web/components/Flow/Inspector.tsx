/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { useFlowStore } from "@/hooks/useFlowStore";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { AnyNodeData } from "./types";

const TABS = ["config", "prompt", "logs"] as const;
type Tab = (typeof TABS)[number];

export default function Inspector() {
  const { nodes, selectedId, setNodes, flowId, flowName, runEvents } =
    useFlowStore();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("config");

  const selected = useMemo(
    () => nodes.find((n) => n.id === selectedId),
    [nodes, selectedId]
  );

  const updateNodeData = (patch: Partial<AnyNodeData>) => {
    if (!selected) return;
    const next = nodes.map((n) =>
      n.id === selected.id
        ? { ...n, data: { ...(n.data as any), ...patch } }
        : n
    );
    setNodes(next as any);
  };

  const openInPro = () => {
    // If you have a flowId, Pro can open that entry. For now, route to Pro surface.
    router.push(
      "/pro" + (flowId ? `?flowId=${encodeURIComponent(flowId)}` : "")
    );
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[hsl(var(--border))] p-3">
        <div className="text-sm font-medium">Inspector</div>
        <div className="text-xs opacity-70">{flowName}</div>
      </div>

      <div className="flex items-center gap-2 border-b border-[hsl(var(--border))] p-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={[
              "px-3 py-1.5 rounded-xl text-sm border",
              tab === t
                ? "border-[hsl(var(--border))] bg-[hsl(var(--card))]"
                : "border-transparent opacity-70 hover:opacity-100",
            ].join(" ")}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-3">
        {!selected ? (
          <div className="text-sm opacity-70">Select a node to edit.</div>
        ) : (
          <>
            {tab === "config" && (
              <div className="space-y-3">
                <div>
                  <div className="text-xs opacity-70 mb-1">Node Type</div>
                  <Select
                    value={(selected.data as any)?.type ?? selected.type ?? ""}
                    onChange={(v) => updateNodeData({ type: v as any })}
                    options={[
                      ["start", "Start"],
                      ["model", "Model"],
                      ["tool", "Tool"],
                      ["output", "Output"],
                    ]}
                  />
                </div>

                <div>
                  <div className="text-xs opacity-70 mb-1">Label</div>
                  <Input
                    value={(selected.data as any)?.label ?? ""}
                    onChange={(e) =>
                      updateNodeData({ label: e.target.value } as any)
                    }
                    placeholder="Optional label"
                  />
                </div>
              </div>
            )}

            {tab === "prompt" && (
              <div>
                <div className="text-xs opacity-70 mb-1">
                  Prompt / Instructions
                </div>
                <Textarea
                  value={(selected.data as any)?.prompt ?? ""}
                  onChange={(e) =>
                    updateNodeData({ prompt: e.target.value } as any)
                  }
                  placeholder="Write node instructions…"
                  rows={10}
                />
              </div>
            )}

            {tab === "logs" && (
              <div className="space-y-2">
                {runEvents.length === 0 ? (
                  <div className="text-xs opacity-70">
                    Run logs will appear here during execution.
                  </div>
                ) : (
                  <div className="max-h-[360px] overflow-auto rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-2">
                    {runEvents.map((ev: any, i: number) => (
                      <div
                        key={i}
                        className="text-xs py-1 border-b border-[hsl(var(--border))] last:border-b-0"
                      >
                        <div className="opacity-70">{ev.type}</div>
                        <pre className="whitespace-pre-wrap wrap-break-word">
                          {JSON.stringify(ev.payload ?? ev, null, 2)}
                        </pre>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <div className="border-t border-[hsl(var(--border))] p-3">
        <Button onClick={openInPro}>Open in Pro</Button>
      </div>
    </div>
  );
}
