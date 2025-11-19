"use client";
import { FlowGraph } from "@/services/api";
import type { Edge, Node } from "reactflow";
import { create } from "zustand";
import type { AnyNodeData } from "./types";

type State = {
  nodes: Node<AnyNodeData>[];
  edges: Edge[];
  selectedId?: string;
  flowId?: string;
  flowName: string;
  setGraph: (nodes: Node<AnyNodeData>[], edges: Edge[]) => void;
  setNodes: (n: Node<AnyNodeData>[]) => void;
  setEdges: (e: Edge[]) => void;
  select: (id?: string) => void;
  setFlowMeta: (id: string | undefined, name: string) => void;
};

export const useFlowStore = create<State>((set) => ({
  nodes: [],
  edges: [],
  selectedId: undefined,
  flowId: undefined,
  flowName: "Untitled Flow",
  setGraph: (nodes, edges) => set({ nodes, edges }),
  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),
  select: (selectedId) => set({ selectedId }),
  setFlowMeta: (flowId, flowName) => set({ flowId, flowName }),
}));

export const DEFAULT_GRAPH: FlowGraph = {
  nodes: [
    {
      id: "start",
      type: "start",
      position: { x: 0, y: 0 },
      data: { title: "Start", trigger: "manual" },
    },
    {
      id: "model",
      type: "model",
      position: { x: 250, y: 0 },
      data: {
        title: "Model",
        provider: "openai",
        model: "gpt-4.1",
        maxTokens: 1024,
      },
    },
    {
      id: "tool",
      type: "tool",
      position: { x: 500, y: 0 },
      data: { title: "Tool", toolName: "web-fetch", mode: "mcp" },
    },
    {
      id: "output",
      type: "output",
      position: { x: 750, y: 0 },
      data: { title: "Output", sink: "console" },
    },
  ],
  edges: [
    { id: "e-start-model", source: "start", target: "model" },
    { id: "e-model-tool", source: "model", target: "tool" },
    { id: "e-tool-output", source: "tool", target: "output" },
  ],
};
