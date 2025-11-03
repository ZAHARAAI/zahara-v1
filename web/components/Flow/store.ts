"use client";
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
