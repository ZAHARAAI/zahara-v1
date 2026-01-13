/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { AnyNodeData } from "@/components/Flow/types";
import { RunEvent } from "@/services/api";
import type { Edge, Node } from "reactflow";
import { create } from "zustand";

type State = {
  nodes: Node<AnyNodeData>[];
  edges: Edge[];
  selectedId?: string;
  runInput: string;
  flowName: string;
  runEvents: RunEvent[];
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
  setRunInput: (v: string) => void;
  setFlowName: (name: string) => void;
  setFlowMeta: (meta: Record<string, any>) => void;
  clearRunEvents: () => void;
  pushRunEvent: (ev: RunEvent) => void;
};

export const useFlowStore = create<State>((set) => ({
  nodes: [],
  edges: [],
  selectedId: undefined,
  runInput: "",
  flowName: "",
  meta: {},
  runEvents: [],
  setGraph: (nodes, edges) => set({ nodes, edges }),
  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),
  select: (selectedId) => set({ selectedId }),
  setRunInput: (runInput) => set({ runInput }),
  setFlowName: (flowName) => set({ flowName }),
  setFlowMeta: (meta) => set({ meta }),
  clearRunEvents: () => set({ runEvents: [] }),
  pushRunEvent: (ev: RunEvent) =>
    set((s) => ({ runEvents: [...s.runEvents, ev].slice(-200) })),
}));
