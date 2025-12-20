/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { Button } from "@/components/ui/Button";
import { useFlowStore } from "@/hooks/useFlowStore";
import type { AnyNodeData } from "./types";
import type { Node } from "reactflow";

const BLOCKS: Array<{
  type: AnyNodeData["type"];
  label: string;
  hint: string;
}> = [
  { type: "start", label: "Start", hint: "Entry point" },
  { type: "model", label: "Model", hint: "LLM call" },
  { type: "tool", label: "Tool", hint: "External action" },
  { type: "output", label: "Output", hint: "Final response" },
];

function makeNode(type: AnyNodeData["type"], index: number): Node<AnyNodeData> {
  const id = `${type}-${Date.now()}-${index}`;
  return {
    id,
    type,
    position: { x: 80 + index * 20, y: 80 + index * 20 },
    data: { type } as any,
  };
}

export default function LeftPanel({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const { nodes, setNodes, select } = useFlowStore();

  const addBlock = (type: AnyNodeData["type"]) => {
    const next = [...nodes, makeNode(type, nodes.length)];
    setNodes(next);
    select(next[next.length - 1].id);
  };

  return (
    <div
      className={[
        "border border-[hsl(var(--border))] rounded-2xl overflow-hidden bg-[hsl(var(--panel))] transition-[width] duration-150",
        collapsed ? "w-12" : "w-64",
      ].join(" ")}
    >
      <div className="flex items-center justify-between border-b border-[hsl(var(--border))] p-2">
        {!collapsed && <div className="text-sm font-medium">Blocks</div>}
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggle}
          aria-label="Toggle left panel"
        >
          {collapsed ? ">" : "<"}
        </Button>
      </div>

      {!collapsed && (
        <div className="p-3 space-y-2">
          {BLOCKS.map((b) => (
            <button
              key={b.type}
              onClick={() => addBlock(b.type)}
              className="w-full text-left rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 hover:opacity-90"
            >
              <div className="text-sm font-medium">{b.label}</div>
              <div className="text-xs opacity-70">{b.hint}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
