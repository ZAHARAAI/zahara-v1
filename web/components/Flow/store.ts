"use client";
import { create } from "zustand";
import type { Edge, Node } from "reactflow";
import type { AnyNodeData, FlowGraph } from "./types";

type State = {
  nodes: Node<AnyNodeData>[];
  edges: Edge[];
  selectedId?: string;
  setGraph: (g: FlowGraph) => void;
  setNodes: (n: Node<AnyNodeData>[]) => void;
  setEdges: (e: Edge[]) => void;
  select: (id?: string) => void;
};

export const useFlowStore = create<State>((set) => ({
  nodes: [],
  edges: [],
  selectedId: undefined,
  setGraph: (g) => set({ nodes: g.nodes, edges: g.edges }),
  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),
  select: (selectedId) => set({ selectedId }),
}));
