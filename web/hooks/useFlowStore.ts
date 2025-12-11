/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { AnyNodeData } from "@/components/Flow/types";
import { FlowGraph } from "@/services/api";
import { RunEvent } from "@/services/job6";
import type { Edge, Node } from "reactflow";
import { create } from "zustand";

type State = {
  nodes: Node<AnyNodeData>[];
  edges: Edge[];
  selectedId?: string;
  flowId?: string;
  flowName: string;
  meta?: {
    agentId?: string;
    agentVersion?: number;
    description?: string;
    [key: string]: any;
  };
  setGraph: (nodes: Node<AnyNodeData>[], edges: Edge[]) => void;
  setNodes: (n: Node<AnyNodeData>[]) => void;
  setEdges: (e: Edge[]) => void;
  select: (id?: string) => void;
  setFlowMeta: (meta: Record<string, any>) => void;
  clearRunEvents: () => void;
  pushRunEvent: (ev: RunEvent) => void;
};

export const useFlowStore = create<State>((set) => ({
  nodes: [],
  edges: [],
  selectedId: undefined,
  flowId: undefined,
  flowName: "Untitled Flow",
  meta: {},
  setGraph: (nodes, edges) => set({ nodes, edges }),
  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),
  select: (selectedId) => set({ selectedId }),
  setFlowMeta: (meta) => set({ meta }),
  clearRunEvents: () => {},
  pushRunEvent: (ev: RunEvent) => {},
}));

export const DEFAULT_GRAPH: FlowGraph = {
  name: "Web Research Agent",
  nodes: [
    {
      id: "start",
      type: "start",
      position: { x: 0, y: 40 },
      data: {
        title: "Start: HTTP Trigger",
        trigger: "http",
        description: "Receives a user query via HTTPS endpoint.",
      },
    },
    {
      id: "model",
      type: "model",
      position: { x: 260, y: 40 },
      data: {
        title: "Model: LLM Response",
        provider: "openai",
        model: "gpt-4.1-mini",
        temperature: 0.3,
        maxTokens: 800,
        prompt:
          "You are a web research agent. Use the fetched content to answer the user’s question clearly and concisely.",
        description:
          "Calls the LLM to decide what to fetch and how to respond to the user.",
      },
    },
    {
      id: "tool",
      type: "tool",
      position: { x: 540, y: 40 },
      data: {
        title: "Tool: Web Fetch",
        toolName: "web-fetch",
        mode: "mcp",
        entry: "src/agents/webFetchAgent.ts", // <- main entry used by Pro
        description: "Fetches and normalises external HTTP resources.",
        args: {
          url: "https://example.com/docs",
          method: "GET",
          timeoutMs: 5000,
          headers: {
            "User-Agent": "NOMO-Agent/1.0",
          },
        },
      },
    },
    {
      id: "output",
      type: "output",
      position: { x: 820, y: 40 },
      data: {
        title: "Output: Console Sink",
        sink: "console",
        description:
          "Streams the final answer back to the caller and logs for observability.",
      },
    },
  ],
  edges: [
    {
      id: "e-start-model",
      source: "start",
      target: "model",
    },
    {
      id: "e-model-tool",
      source: "model",
      target: "tool",
    },
    {
      id: "e-tool-output",
      source: "tool",
      target: "output",
    },
  ],
  meta: {
    entry: "src/agents/webFetchAgent.ts",
    version: 1,
    description: "Default production-ready web research flow.",
  },
};
