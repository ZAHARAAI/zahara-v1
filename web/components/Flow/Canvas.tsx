/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import React, { useCallback } from "react";
import ReactFlow, {
  Background,
  Connection,
  Controls,
  Edge,
  Node,
  addEdge,
  useEdgesState,
  useNodesState,
} from "reactflow";
import "reactflow/dist/style.css";
import { ModelNode } from "./nodes/ModelNode";
import { OutputNode } from "./nodes/OutputNode";
import { StartNode } from "./nodes/StartNode";
import { ToolNode } from "./nodes/ToolNode";
import { useFlowStore } from "./store";

const nodeTypes = {
  start: StartNode,
  model: ModelNode,
  tool: ToolNode,
  output: OutputNode,
};

const initialNodes: Node[] = [
  {
    id: "start",
    position: { x: 80, y: 160 },
    type: "start",
    data: { title: "Start", trigger: "manual" },
  },
  {
    id: "model",
    position: { x: 340, y: 160 },
    type: "model",
    data: {
      title: "Model",
      provider: "openai",
      model: "gpt-4o-mini",
      temperature: 0.5,
    },
  },
  {
    id: "tool",
    position: { x: 640, y: 160 },
    type: "tool",
    data: { title: "Tool", toolName: "web-fetch", args: {} },
  },
  {
    id: "output",
    position: { x: 920, y: 160 },
    type: "output",
    data: { title: "Output", sink: "console" },
  },
];

const initialEdges: Edge[] = [
  { id: "e1", source: "start", target: "model" },
  { id: "e2", source: "model", target: "tool" },
  { id: "e3", source: "tool", target: "output" },
];

export default function Canvas() {
  const {
    setNodes: setStoreNodes,
    setEdges: setStoreEdges,
    select,
  } = useFlowStore();
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback(
    (c: Connection) => setEdges((eds) => addEdge(c, eds)),
    [setEdges]
  );
  const onSelectionChange = useCallback(
    ({ nodes }: { nodes: Node[] }) => {
      select(nodes?.[0]?.id);
    },
    [select]
  );

  // mirror local state to store for save/load
  React.useEffect(() => {
    setStoreNodes(nodes as any);
  }, [nodes, setStoreNodes]);
  React.useEffect(() => {
    setStoreEdges(edges);
  }, [edges, setStoreEdges]);

  return (
    <div className="h-[calc(100vh-8rem)]">
      <ReactFlow
        nodes={nodes}
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
