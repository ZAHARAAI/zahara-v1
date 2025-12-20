/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Edge, Node } from "reactflow";

export type NodeKind = "start" | "model" | "tool" | "output";

export type BaseNodeData = {
  title: string;
  description?: string;
  type?: string;
};

export type StartNodeData = BaseNodeData & {
  trigger: "http" | "schedule" | "manual";
};

export type ModelNodeData = BaseNodeData & {
  provider: "openai" | "anthropic" | "groq";
  model: string;
  temperature?: number;
  prompt?: string;
  maxTokens?: number;
};

export type ToolNodeData = BaseNodeData & {
  toolName: string;
  args?: Record<string, any>;
  mode?: "mcp" | "standard";
  entry?: string;
};

export type OutputNodeData = BaseNodeData & {
  sink: "console" | "webhook" | "file";
};

export type AnyNodeData =
  | StartNodeData
  | ModelNodeData
  | ToolNodeData
  | OutputNodeData;

export type FlowGraph = {
  name?: string;
  nodes: Node<AnyNodeData>[];
  edges: Edge[];
  meta?: {
    entry?: string;
    [key: string]: any;
  };
};
