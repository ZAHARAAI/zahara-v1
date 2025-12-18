/* eslint-disable @typescript-eslint/no-explicit-any */
/* Merged API client: Job6 + existing endpoints */

import { api } from "@/actions/api";
import { AnyNodeData } from "@/components/Flow/types";
import { Edge, Node } from "reactflow";

/* -------------------- Agents -------------------- */

export interface Agent {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
  version?: number | null;
  spec?: Record<string, any> | null;
}

export interface AgentListItem {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  updatedAt: string;
  version?: number | null;
}

export interface AgentListResponse {
  ok: boolean;
  items: AgentListItem[];
  page: number;
  pageSize: number;
  total: number;
}

export async function listAgents(
  page = 1,
  pageSize = 50
): Promise<AgentListItem[]> {
  const json = await api(`/agents?page=${page}&pageSize=${pageSize}`);
  const data = json as AgentListResponse;
  if (data.ok === false) {
    const msg = (data as any).error?.message ?? "Failed to list agents";
    throw new Error(msg);
  }
  return data.items ?? [];
}

export async function getAgent(agentId: string): Promise<Agent> {
  const json = await api(`/agents/${encodeURIComponent(agentId)}`);
  const data = json as { ok: boolean; agent: Agent; error?: any };
  if (!data.ok) {
    const msg = data.error?.message ?? "Failed to load agent";
    throw new Error(msg);
  }
  return data.agent;
}

export interface CreateAgentBody {
  name: string;
  description?: string | null;
  spec?: Record<string, any> | null;
}

export async function createAgent(body: CreateAgentBody): Promise<Agent> {
  const json = await api("/agents", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const data = json as { ok: boolean; agent: Agent; error?: any };
  if (!data.ok) {
    const msg = data.error?.message ?? "Failed to create agent";
    throw new Error(msg);
  }
  return data.agent;
}

export interface UpdateAgentBody {
  name?: string;
  description?: string | null;
}

export async function updateAgent(
  agentId: string,
  body: UpdateAgentBody
): Promise<void> {
  const json = await api(`/agents/${encodeURIComponent(agentId)}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
  const data = json as { ok?: boolean; updated?: boolean; error?: any };
  if (data.ok === false) {
    const msg = data.error?.message ?? "Failed to update agent";
    throw new Error(msg);
  }
}

export interface CreateAgentSpecBody {
  content: Record<string, any>;
}

export async function createAgentSpec(
  agentId: string,
  body: CreateAgentSpecBody
): Promise<{ agentId: string; version: number }> {
  const json = await api(`/agents/${encodeURIComponent(agentId)}/spec`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  const data = json as {
    ok: boolean;
    agentId: string;
    version: number;
    error?: any;
  };
  if (!data.ok) {
    const msg = data.error?.message ?? "Failed to save agent spec";
    throw new Error(msg);
  }
  return { agentId: data.agentId, version: data.version };
}

/**
 * Upsert an Agent + AgentSpec for a Flow graph.
 *
 * We use a simple "unified" spec shape:
 * {
 *   mode: "flow",
 *   graph: { nodes, edges },
 *   meta:  { name, description, ... }
 * }
 *
 * If agentId is provided, we just create a new spec version.
 * Otherwise we create a new agent with the spec as the initial content.
 */
export interface FlowAgentUpsertParams {
  agentId?: string | null;
  name: string;
  description?: string | null;
  graph: {
    nodes: any[];
    edges: any[];
  };
  meta?: Record<string, any> | null;
}

export interface FlowAgentUpsertResult {
  agentId: string;
  version: number;
  agent?: Agent;
}

export async function upsertAgentFromFlow(
  params: FlowAgentUpsertParams
): Promise<FlowAgentUpsertResult> {
  const specContent: Record<string, any> = {
    mode: "flow",
    graph: {
      nodes: params.graph.nodes,
      edges: params.graph.edges,
    },
    meta: {
      name: params.name,
      description: params.description ?? null,
      ...(params.meta ?? {}),
    },
  };

  if (!params.agentId) {
    const agent = await createAgent({
      name: params.name,
      description: params.description ?? null,
      spec: specContent,
    });
    return {
      agentId: agent.id,
      version: agent.version ?? 1,
      agent,
    };
  }

  const { version } = await createAgentSpec(params.agentId, {
    content: specContent,
  });
  return {
    agentId: params.agentId,
    version,
    agent: undefined,
  };
}

/* -------------------- Runs + SSE -------------------- */

export type RunEventType =
  | "system"
  | "log"
  | "token"
  | "tool_call"
  | "tool_result"
  | "ping"
  | "done"
  | "error";

export interface RunEvent {
  /** Event kind emitted from the backend. */
  type: RunEventType;
  /** ISO timestamp when the event was received on the client. */
  ts: string;
  /** Optional display message. */
  message?: string;
  /** Raw payload as stored in run_events.payload. */
  payload?: Record<string, any>;
  /** Extra fields for backward compatibility. */
  [key: string]: any;
}

export interface StartRunRequest {
  /** User message or task for the agent. */
  input: string;
  /** Source surface: vibe | pro | flow | agui | api | clinic. */
  source?: string;
  /** Optional execution config stored on the run row. */
  config?: Record<string, any>;
}

export interface StartRunResponse {
  runId: string;
  requestId: string;
}

export async function startAgentRun(
  agentId: string,
  body: StartRunRequest
): Promise<StartRunResponse> {
  const json = await api(`/agents/${encodeURIComponent(agentId)}/run`, {
    method: "POST",
    body: JSON.stringify({
      input: body.input,
      source: body.source ?? "vibe",
      config: body.config ?? {},
    }),
  });
  const data = json as {
    ok: boolean;
    run_id: string;
    request_id: string;
    error?: any;
  };
  if (!data.ok) {
    const msg = data.error?.message ?? "Failed to start run";
    throw new Error(msg);
  }
  return {
    runId: data.run_id,
    requestId: data.request_id,
  };
}

/**
 * Subscribe to run events over SSE.
 *
 * Returns a cleanup function that closes the EventSource.
 */
export function streamRun(
  runId: string,
  onEvent: (event: RunEvent) => void
): () => void {
  if (!runId) throw new Error("runId is required for SSE");

  // This hits your Next.js proxy route (server adds Authorization header)
  const es = new EventSource(`/api/sse/runs/${encodeURIComponent(runId)}`);

  const emit = (raw: any) => {
    // Backend shape:
    // { type: string, payload: object, created_at: string, request_id: string }
    const backendType = (raw?.type as string | undefined) ?? "log";
    const payload = (raw?.payload ?? null) as any;

    // Prefer payload.message, but fall back to other fields if present
    const message =
      (payload && (payload.message as string | undefined)) ||
      (payload && (payload.text as string | undefined)) ||
      (payload && (payload.error as string | undefined)) ||
      undefined;

    // Normalize ts and requestId
    const ts =
      (raw?.created_at as string | undefined) ?? new Date().toISOString();
    const requestId =
      (raw?.request_id as string | undefined) ??
      (payload && (payload.request_id as string | undefined));

    const evt: RunEvent = {
      type: backendType as RunEventType, // assumes RunEventType includes backend types
      ts,
      message,
      payload,
      requestId,
      runId,
      raw, // keep the raw object for debugging
    };

    onEvent(evt);
  };

  // ✅ Since backend only uses "data:" frames, use onmessage
  es.onmessage = (evt: MessageEvent) => {
    if (!evt?.data) return;

    try {
      const parsed = JSON.parse(evt.data);
      emit(parsed);
    } catch {
      // If upstream ever sends non-JSON, still surface it
      emit({ type: "log", payload: { raw: evt.data } });
    }
  };

  // Surface connection errors as an error event, but don’t hard-close immediately.
  // EventSource will auto-reconnect by default.
  es.onerror = () => {
    onEvent({
      type: "error" as RunEventType,
      ts: new Date().toISOString(),
      message: "sse_connection_error",
      payload: { runId },
    } as RunEvent);
  };

  return () => {
    es.close();
  };
}

/* -------------------- Runs listing + detail (Clinic) -------------------- */

export interface RunListItem {
  id: string;
  agent_id?: string | null;
  status: string;
  model?: string | null;
  provider?: string | null;
  source?: string | null;
  latency_ms?: number | null;
  tokens_total?: number | null;
  cost_estimate_usd?: number | null;
  created_at: string;
}

export interface RunListResponse {
  ok: boolean;
  items: RunListItem[];
  total: number;
  limit: number;
  offset: number;
}

export async function listRuns(
  limit = 50,
  offset = 0
): Promise<RunListResponse> {
  const json = await api(`/runs?limit=${limit}&offset=${offset}`);
  const data = json as RunListResponse & { error?: any };
  if (data.ok === false) {
    const msg = data.error?.message ?? "Failed to list runs";
    throw new Error(msg);
  }
  return data;
}

export interface RunDetail {
  id: string;
  agent_id?: string | null;
  user_id?: number | null;
  request_id?: string | null;
  status: string;
  model?: string | null;
  provider?: string | null;
  source?: string | null;
  latency_ms?: number | null;
  tokens_in?: number | null;
  tokens_out?: number | null;
  tokens_total?: number | null;
  cost_estimate_usd?: number | null;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
  config?: Record<string, any> | null;
}

export interface RunEventRecord {
  id: number;
  type: RunEventType;
  payload: Record<string, any>;
  created_at: string;
}

export interface RunDetailResponse {
  ok: boolean;
  run: RunDetail;
  events: RunEventRecord[];
}

export async function getRunDetail(runId: string): Promise<RunDetailResponse> {
  const json = await api(`/runs/${encodeURIComponent(runId)}`);
  const data = json as RunDetailResponse & { error?: any };
  if (data.ok === false) {
    const msg = data.error?.message ?? "Failed to load run";
    throw new Error(msg);
  }
  return data;
}

/* -------------------- Provider keys -------------------- */

export interface ProviderKey {
  id: string;
  provider: string;
  label: string;
  last_test_status?: string | null;
  last_tested_at?: string | null;
  created_at: string;
  updated_at: string;
}

interface ProviderKeyListResponse {
  ok: boolean;
  items: ProviderKey[];
}

export async function listProviderKeys(): Promise<ProviderKey[]> {
  const json = await api("/provider-keys");
  const data = json as ProviderKeyListResponse & { error?: any };
  if (data.ok === false) {
    const msg = data.error?.message ?? "Failed to list provider keys";
    throw new Error(msg);
  }
  return data.items ?? [];
}

export async function createProviderKey(params: {
  provider: string;
  label: string;
  secret: string;
}): Promise<ProviderKey> {
  const json = await api("/provider-keys", {
    method: "POST",
    body: JSON.stringify(params),
  });
  const data = json as ProviderKey & { ok?: boolean; error?: any };
  // Router returns the item directly with 201.
  if ((data as any).ok === false) {
    const msg = (data as any).error?.message ?? "Failed to create provider key";
    throw new Error(msg);
  }
  return data;
}

export async function deleteProviderKey(id: string): Promise<void> {
  const json = await api(`/provider-keys/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  const data = json as { ok?: boolean; error?: any };
  if (data.ok === false) {
    const msg = data.error?.message ?? "Failed to delete provider key";
    throw new Error(msg);
  }
}

export async function testProviderKey(id: string): Promise<{
  id: string;
  status: string;
  message?: string;
  last_tested_at?: string;
}> {
  const json = await api(`/provider-keys/${encodeURIComponent(id)}/test`, {
    method: "POST",
  });
  const data = json as {
    ok: boolean;
    id: string;
    status: string;
    message?: string;
    last_tested_at?: string;
    error?: any;
  };
  if (data.ok === false) {
    const msg = data.error?.message ?? "Failed to test provider key";
    throw new Error(msg);
  }
  return {
    id: data.id,
    status: data.status,
    message: data.message,
    last_tested_at: data.last_tested_at,
  };
}

/* -------------------- Run event constants -------------------- */
// Convenience list for UI filters, etc.
export const RUN_EVENT_TYPES: RunEventType[] = [
  "token",
  "log",
  "tool_call",
  "tool_result",
  "error",
  "done",
  "ping",
];

function ensureOk<T extends { ok?: boolean; error?: any }>(
  json: T,
  hint: string
): T {
  if (json && json.ok === false) {
    const msg = json.error?.message || `Request failed: ${hint}`;
    throw new Error(msg);
  }
  return json;
}

/* ----------------------------------------------------- */
/* Filesystem (Pro IDE)                                  */
/* ----------------------------------------------------- */

export interface IdeFileEntry {
  path: string;
  type: string;
  size?: number;
}

export interface IdeFile {
  ok: boolean;
  path: string;
  content: string;
  sha: string;
}

interface ListFilesResponse {
  ok: boolean;
  files: IdeFileEntry[];
}

export interface SaveFileResponse {
  ok: boolean;
  saved: boolean;
  sha: string;
}

export async function listFiles(): Promise<IdeFileEntry[]> {
  const json = await api("/files");
  const data: ListFilesResponse = ensureOk(json, "listing files");
  return data.files;
}

export async function readFile(path: string): Promise<IdeFile> {
  if (!path) throw new Error("File path is required");
  const safePath = encodeURIComponent(path);
  const json = await api(`/files/${safePath}`);
  return ensureOk(json, `reading file ${path}`);
}

export async function saveFile(
  path: string,
  content: string,
  sha?: string
): Promise<SaveFileResponse> {
  if (!path) throw new Error("File path is required");
  const safePath = encodeURIComponent(path);

  const body = { content, ...(sha ? { sha } : {}) };

  const json = await api(`/files/${safePath}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });

  return ensureOk(json, `saving file ${path}`);
}

/* ----------------------------------------------------- */
/* Flows (builder)                                       */
/* ----------------------------------------------------- */

export type FlowGraph = {
  name?: string;
  nodes: Node<AnyNodeData>[];
  edges: Edge[];
  meta?: {
    entry?: string;
    [key: string]: any;
  };
};

export type FlowSummary = {
  id: string;
  name: string;
  updatedAt?: string;
};

export async function listFlows(): Promise<FlowSummary[]> {
  const json = await api(`/flows`);
  const data = ensureOk(json, "listing flows");
  return data.items ?? [];
}

export async function getFlow(id: string): Promise<{
  id: string;
  name: string;
  graph: FlowGraph;
  updatedAt?: string;
}> {
  const json = await api(`/flows/${id}`);
  const data = ensureOk(json, `loading flow ${id}`);
  return data.flow;
}

export async function createFlow(
  name: string,
  graph: FlowGraph
): Promise<{
  id: string;
  name: string;
  graph: FlowGraph;
  updatedAt?: string;
}> {
  const json = await api(`/flows`, {
    method: "POST",
    body: JSON.stringify({ name, graph }),
  });
  const data = ensureOk(json, "creating flow");
  return data.flow;
}

export async function updateFlow(
  id: string,
  name: string,
  graph: FlowGraph
): Promise<{
  ok: boolean;
  updated: boolean;
}> {
  const json = await api(`/flows/${id}`, {
    method: "PUT",
    body: JSON.stringify({ name, graph }),
  });

  return ensureOk(json, `updating flow ${id}`);
}

/* ----------------------------------------------------- */
/* Run + SSE (Pro + Clinic + AG-UI)                      */
/* ----------------------------------------------------- */

export interface RunRequestBody {
  /** Where the run was launched from, e.g. "pro_ide" or "flow_builder". */
  source: string;
  /** Arbitrary payload that your worker/runtime understands. */
  payload: Record<string, any>;
  /** Optional model identifier. */
  model?: string | null;
  /** Optional extra metadata. */
  metadata?: Record<string, any> | null;
}

export interface RunResponse {
  run_id: string;
  request_id: string;
  status: string;
  started_at: string;
}

export async function startRun(body: RunRequestBody): Promise<{
  runId: string;
  requestId: string;
  status: string;
  startedAt: string;
}> {
  const data: RunResponse = await api("/run", {
    method: "POST",
    body: JSON.stringify(body),
  });

  return {
    runId: data.run_id,
    requestId: data.request_id,
    status: data.status,
    startedAt: data.started_at,
  };
}

/* ----------------------------------------------------- */
/* Clinic (runtime viewer)                               */
/* ----------------------------------------------------- */

export type SessionSummary = {
  requestId: string;
  runId: string;
  status: string;
  model?: string;
  source?: string;
  tokens?: number;
  cost?: number;
  latencyMs?: number;
  startedAt?: string;
  finishedAt?: string;
};

export interface Event {
  type: string;
  payload: {
    type: string;
    status: string;
    runId: string;
    requestId: string;
    ts?: string;
    [key: string]: any;
  };
  ts?: string;
}

export async function listSessions(): Promise<SessionSummary[]> {
  const json = await api(`/clinic/sessions`);
  const data = ensureOk(json, "listing sessions");
  return data.items ?? [];
}

export async function getSessionByRequestId(requestId: string): Promise<{
  ok: boolean;
  session: {
    request_id: string;
    run_id: string;
    events: Event[];
    summary: SessionSummary;
  };
}> {
  const json = await api(`/clinic/session/${encodeURIComponent(requestId)}`);
  return ensureOk(json, `getting session ${requestId}`);
}

export async function replaySession(requestId: string): Promise<{
  runId: string;
  requestId: string;
  status: string;
  startedAt?: string;
}> {
  const json = await api(`/clinic/replay/${encodeURIComponent(requestId)}`, {
    method: "POST",
  });
  const data = ensureOk(json, `replaying session ${requestId}`);

  return {
    runId: data.run_id,
    requestId: data.request_id,
    status: data.status,
    startedAt: data.started_at,
  };
}

export async function exportSession(requestId: string) {
  // simplest: just re-use getSession and let the caller download JSON
  return getSessionByRequestId(requestId);
}

/* ----------------------------------------------------- */
/* MCP                                                   */
/* ----------------------------------------------------- */

export type McpConnector = {
  id: string;
  name: string;
  enabled: boolean;
  status: string;
  meta?: Record<string, any>;
};

export async function listConnectors(): Promise<McpConnector[]> {
  const json = await api(`/mcp/connectors`);
  const data = ensureOk(json, "listing connectors");
  return data.connectors ?? [];
}

export async function patchConnector(
  id: string,
  enabled: boolean
): Promise<{ ok: boolean; id: string; enabled: boolean }> {
  const json = await api(`/mcp/connectors/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ enabled }),
  });
  return ensureOk(json, "updating connector");
}

export const testConnector = async (
  id: string
): Promise<{
  ok: boolean;
  connectorId: string;
  latencyMs: number;
  logs: string[]; //["auth ok", "ping ok"]
}> => {
  const json = await api(`/mcp/test`, {
    method: "POST",
    body: JSON.stringify({ connectorId: id }),
  });
  return ensureOk(json, "testing connector");
};
