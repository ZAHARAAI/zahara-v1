/* eslint-disable @typescript-eslint/no-explicit-any */
/* Job 6 frontend wiring: agents, runs, SSE */

import { api } from "@/actions/api";

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
  | "token"
  | "log"
  | "tool_call"
  | "tool_result"
  | "error"
  | "done"
  | "ping";

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

  const base = process.env.NEXT_PUBLIC_API_BASE_URL || "";

  const url = `${base}/runs/${encodeURIComponent(runId)}/events`;
  const es = new EventSource(url);

  const handler =
    (type: RunEventType) =>
    (evt: MessageEvent): void => {
      let payload: any = null;
      try {
        payload = evt.data ? JSON.parse(evt.data) : null;
      } catch {
        payload = { raw: evt.data };
      }

      const msg =
        (payload && (payload.message as string | undefined)) ||
        (payload && (payload.text as string | undefined));

      const event: RunEvent = {
        type,
        ts: new Date().toISOString(),
        message: msg,
        payload,
      };

      onEvent(event);
    };

  const types: RunEventType[] = [
    "token",
    "log",
    "tool_call",
    "tool_result",
    "error",
    "done",
    "ping",
  ];
  types.forEach((t) => {
    es.addEventListener(t, handler(t));
  });

  es.onerror = () => {
    es.close();
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
