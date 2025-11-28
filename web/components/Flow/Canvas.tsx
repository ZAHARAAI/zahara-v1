/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect } from "react";
import ReactFlow, {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Connection,
  Controls,
  Edge,
  EdgeChange,
  Node,
  NodeChange,
} from "reactflow";
import "reactflow/dist/style.css";

import { DEFAULT_GRAPH, useFlowStore } from "@/hooks/useFlowStore";
import { ModelNode } from "./nodes/ModelNode";
import { OutputNode } from "./nodes/OutputNode";
import { StartNode } from "./nodes/StartNode";
import { ToolNode } from "./nodes/ToolNode";
import type { AnyNodeData } from "./types";

const nodeTypes = {
  start: StartNode,
  model: ModelNode,
  tool: ToolNode,
  output: OutputNode,
};

export default function Canvas() {
  const {
    flowId,
    nodes,
    edges,
    setNodes,
    setEdges,
    setGraph,
    select,
    setFlowMeta,
  } = useFlowStore();

  useEffect(() => {
    if (!flowId && nodes.length === 0) {
      setGraph(DEFAULT_GRAPH.nodes as any, DEFAULT_GRAPH.edges);
      setFlowMeta(undefined, "New Flow");
    }
  }, [flowId, nodes.length, setGraph, setFlowMeta]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes(applyNodeChanges(changes, nodes as Node<AnyNodeData>[]));
    },
    [nodes, setNodes]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges(applyEdgeChanges(changes, edges as Edge[]));
    },
    [edges, setEdges]
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges(addEdge(connection, edges));
    },
    [edges, setEdges]
  );

  const onSelectionChange = useCallback(
    (params: { nodes?: Node[] } | null) => {
      const first = params?.nodes?.[0];
      select(first?.id);
    },
    [select]
  );

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes as Node[]}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onSelectionChange={onSelectionChange as any}
        nodeTypes={nodeTypes}
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
