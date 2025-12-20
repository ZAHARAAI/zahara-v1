/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* Merged API client: Job6 + existing endpoints */

import { api } from "@/actions/api";
import { AnyNodeData } from "@/components/Flow/types";
import { Edge, Node } from "reactflow";

/**
 * Small helper: backend sometimes returns {ok:false, error:{...}} with 200,
 * while actions/api.ts throws on non-2xx. We normalize the 200+ok=false case here.
 */
function ensureOk(json: any, msg: string) {
  if (!json.ok && json.error) throw new Error(msg);
  return json;
}

/* ------------------------------------------------------------------ */
/* Agents                                                             */
/* ------------------------------------------------------------------ */

/** Public (frontend-friendly) agent model */
export type Agent = {
  id: string;
  user_id: number;
  name: string;
  slug: string;
  description?: string | null;
  created_at: string;
  updated_at: string;
};

export type AgentSpec = {
  ok: boolean;
  agent: Agent;
  spec?: Record<string, any>;
  spec_version?: number;
};

/** What listAgents() returns (frontend-friendly) */
export type AgentListResponse = {
  ok: boolean;
  items: Agent[];
};

/* -------------------- API functions -------------------- */

/**
 * Backend: GET /agents?q=...
 */
export async function listAgents(q?: string): Promise<Agent[]> {
  const json = await api(q ? `/agents?q=${q}` : "/agents");
  const data: AgentListResponse = ensureOk(json, "listing agents");
  return data.items || [];
}

// TODO: getAgent has not been used
export async function getAgent(agentId: string): Promise<AgentSpec> {
  const json = await api(`/agents/${encodeURIComponent(agentId)}`);
  const data = ensureOk(json, `loading agent ${agentId}`);
  return data;
}

export type CreateAgentBody = {
  name: string;
  description?: string | null;
  spec: Record<string, any>;
};

// TODO: createAgent has not been used
export async function createAgent(body: CreateAgentBody): Promise<AgentSpec> {
  const json = await api(`/agents`, {
    method: "POST",
    body: JSON.stringify({
      name: body.name,
      description: body.description ?? null,
      spec: body.spec ?? {},
    }),
  });

  const data = ensureOk(json, "creating agent");
  return data;
}

export type UpdateAgentBody = {
  name?: string | null;
  description?: string | null;
};

// TODO: updateAgent has not been used
export async function updateAgent(
  agentId: string,
  body: UpdateAgentBody
): Promise<AgentSpec> {
  const json = await api(`/agents/${encodeURIComponent(agentId)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });

  const data = ensureOk(json, `updating agent ${agentId}`);
  return data;
}

export type CreateAgentSpecBody = {
  spec: Record<string, any>;
};

// TODO: createAgentSpec has not been used
export async function createAgentSpec(
  agentId: string,
  body: CreateAgentSpecBody
): Promise<AgentSpec> {
  const json = await api(`/agents/${encodeURIComponent(agentId)}/spec`, {
    method: "POST",
    body: JSON.stringify(body),
  });

  const data = ensureOk(json, `creating spec for agent ${agentId}`);
  return data;
}

/* -------------------- Flow -> Agent upsert -------------------- */

export type FlowAgentUpsertParams = {
  /** If provided, update spec for existing agent. Otherwise create new. */
  agent_id?: string | null;
  /** Agent display name */
  name: string;
  /** Optional description */
  description?: string | null;

  /** Flow graph from ReactFlow */
  graph: {
    nodes: Node<AnyNodeData>[];
    edges: Edge[];
  };

  /** Extra metadata (entry node id, etc.) */
  meta?: Record<string, any>;
};

export async function upsertAgentFromFlow(
  params: FlowAgentUpsertParams
): Promise<AgentSpec> {
  // Spec shape is free-form JSON; backend stores it as agent_specs.content (JSONB).
  const spec = {
    mode: "flow",
    graph: {
      nodes: params.graph.nodes,
      edges: params.graph.edges,
    },
    meta: params.meta ?? {},
  };

  let agentSpec: AgentSpec;
  if (params.agent_id) {
    // Keep agent metadata in sync (optional)
    await updateAgent(params.agent_id, {
      name: params.name,
      description: params.description ?? null,
    });

    agentSpec = await createAgentSpec(params.agent_id, { spec });
  } else {
    agentSpec = await createAgent({
      name: params.name,
      description: params.description ?? null,
      spec,
    });
  }

  return agentSpec;
}

/* -------------------- Runs -------------------- */

export type RunEventType =
  | "system"
  | "log"
  | "token"
  | "tool_call"
  | "tool_result"
  | "ping"
  | "done"
  | "error";

export type RunEvent = {
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
};

export type StartRunRequest = {
  /** User message or task for the agent. */
  input: string;
  /** Source surface: vibe | pro | flow | agui | api | clinic. */
  source: string;
  /** Optional execution config stored on the run row. */
  config?: Record<string, any>;
};

export type StartRunResponse = {
  ok: boolean;
  run_id: string;
  request_id: string;
};

export async function startAgentRun(
  agent_id: string,
  body: StartRunRequest
): Promise<StartRunResponse> {
  const json = await api(`/agents/${encodeURIComponent(agent_id)}/run`, {
    method: "POST",
    body: JSON.stringify({
      input: body.input,
      source: body.source ?? "vibe",
      config: body.config ?? {},
    }),
  });

  const data = ensureOk(json, `starting run for agent ${agent_id}`);
  return data;
}

/**
 * Client-side SSE subscription through Next route:
 * /api/sse/runs/[runId] -> proxies backend GET /runs/{runId}/events
 */
export function streamRun(
  run_id: string,
  onEvent: (ev: RunEvent) => void,
  opts?: { onError?: (err: any) => void; signal?: AbortSignal }
) {
  const url = `/api/sse/runs/${encodeURIComponent(run_id)}`;
  const es = new EventSource(url);

  const safeEmit = (ev: Partial<RunEvent>) => {
    onEvent({
      type: (ev.type ?? "log") as RunEventType,
      ts: ev.ts ?? new Date().toISOString(),
      message: ev.message,
      payload: ev.payload,
      ...ev,
    });
  };

  es.onmessage = (msg) => {
    try {
      const data = JSON.parse(msg.data ?? "{}");
      // Backend sends `data: { type, payload, ... }`
      safeEmit({
        type: data.type ?? "log",
        payload: data.payload ?? data,
        message: data.message,
        ts: data.ts,
        ...data,
      });
    } catch (e) {
      safeEmit({ type: "log", message: String(msg.data ?? "") });
    }
  };

  es.onerror = (e) => {
    opts?.onError?.(e);
    // Do not always close here; EventSource auto-reconnects.
    // But if caller used AbortSignal, we close when aborted below.
  };

  if (opts?.signal) {
    const onAbort = () => {
      try {
        es.close();
      } catch {}
    };
    if (opts.signal.aborted) onAbort();
    else opts.signal.addEventListener("abort", onAbort, { once: true });
  }

  return () => {
    try {
      es.close();
    } catch {}
  };
}

/* -------------------- Runs: list + detail -------------------- */

export type RunListItem = {
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
};

export type RunListResponse = {
  ok: boolean;
  items: RunListItem[];
  total: number;
  limit: number;
  offset: number;
};

export async function listRuns(
  limit = 50,
  offset = 0,
  agent_id?: string,
  status_filter?: "pending" | "running" | "success" | "error"
): Promise<RunListResponse> {
  const json = await api(
    `/runs?limit=${limit}&offset=${offset}&agent_id=${agent_id}&status_filter=${status_filter}`
  );
  const data = ensureOk(json, "listing runs");
  return data;
}

export type RunDetail = {
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
};

export type RunEventDTO = {
  id: number;
  type: string;
  payload: Record<string, any>;
  created_at: string;
};

export async function getRunDetail(
  run_id: string
): Promise<{ ok: boolean; run: RunDetail; events: RunEventDTO[] }> {
  const json = await api(`/runs/${encodeURIComponent(run_id)}`);
  const data = ensureOk(json, `loading run ${run_id}`);
  return data;
}

/* ----------------------------------------------------- */
/* Provider Keys                                         */
/* ----------------------------------------------------- */

export type ProviderKey = {
  id: string;
  provider: string;
  label: string;
  last_test_status?: string | null;
  last_tested_at?: string | null;
  created_at: string;
  updated_at?: string | null;
};

type ProviderKeyListResponse = {
  ok: boolean;
  items: ProviderKey[];
};

export type ProviderKyeCreateResponse = {
  ok: boolean;
  provider_key: ProviderKey;
  masked_key: string;
};

export async function listProviderKeys(): Promise<ProviderKey[]> {
  const json = await api("/provider_keys");
  const data: ProviderKeyListResponse = ensureOk(json, "listing provider keys");
  return data.items ?? [];
}

export async function createProviderKey(body: {
  provider: string;
  label: string;
  key: string;
}): Promise<ProviderKey> {
  const json: ProviderKyeCreateResponse = await api("/provider_keys", {
    method: "POST",
    body: JSON.stringify(body),
  });

  return json.provider_key;
}

export async function deleteProviderKey(
  keyId: string
): Promise<{ ok: boolean; deleted: boolean }> {
  const json = await api(`/provider_keys/${encodeURIComponent(keyId)}`, {
    method: "DELETE",
  });
  const data = ensureOk(json, "deleting provider key");
  return data;
}

export async function testProviderKey(keyId: string): Promise<{
  ok: boolean;
  id: string;
  status: string;
  message?: string | null;
  last_tested_at?: string | null;
}> {
  const json = await api(`/provider_keys/${encodeURIComponent(keyId)}/test`, {
    method: "POST",
  });
  const data = ensureOk(json, "testing provider key");
  return data;
}

// TODO: testRawProviderKey method has not been used
/** Spec-compatible raw test: POST /provider_keys/test { provider, key } */
export async function testRawProviderKey(body: {
  provider: string;
  key: string;
}): Promise<{
  ok: boolean;
  provider: string;
  status: string;
  message?: string | null;
}> {
  const json = await api(`/provider_keys/test`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  const data = ensureOk(json, "testing raw provider key");
  return data;
}

/* ----------------------------------------------------- */
/* Pro IDE files                                         */
/* ----------------------------------------------------- */

export type IdeFileEntry = {
  path: string;
  type: "file" | "dir" | string;
  size?: number;
};

export type IdeFile = {
  ok: boolean;
  path: string;
  content: string;
  sha: string;
};

type ListFilesResponse = {
  ok: boolean;
  files: IdeFileEntry[];
};

export type SaveFileResponse = {
  ok: boolean;
  saved: boolean;
  sha: string;
};

export async function listFiles(): Promise<IdeFileEntry[]> {
  const json = await api(`/files`);
  const data: ListFilesResponse = ensureOk(json, "listing files");
  return data.files ?? [];
}

export async function readFile(path: string): Promise<IdeFile> {
  const json = await api(`/files/${encodeURIComponent(path)}`);
  const data = ensureOk(json, `reading file ${path}`);
  return data;
}

export async function saveFile(
  path: string,
  content: string,
  sha?: string | null
): Promise<SaveFileResponse> {
  const json = await api(`/files/${encodeURIComponent(path)}`, {
    method: "PUT",
    body: JSON.stringify({
      content,
      sha: sha ?? undefined,
    }),
  });
  const data = ensureOk(json, `saving file ${path}`);
  return data;
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

export type Flow = {
  id: string;
  name: string;
  graph: { nodes: Node<AnyNodeData>[]; edges: Edge[] };
  updatedAt?: string;
};

export type FlowListItem = {
  id: string;
  name: string;
  updatedAt: string;
};

export type FlowListResponse = {
  ok: boolean;
  items: FlowListItem[];
  page: number;
  pageSize: number;
  total: number;
};

// TODO: listFlows method has not been used
export async function listFlows(
  owner = "me",
  page = 1,
  pageSize = 200
): Promise<FlowListItem[]> {
  const json = await api(
    `/flows?owner=${owner}&page=${page}&pageSize=${pageSize}`
  );
  const data: FlowListResponse = ensureOk(json, "listing flows");
  return data.items ?? [];
}

export async function getFlow(id: string): Promise<Flow> {
  const json = await api(`/flows/${encodeURIComponent(id)}`);
  const data: { ok: boolean; flow: Flow } = ensureOk(
    json,
    `loading flow ${id}`
  );
  return data.flow;
}

// TODO: createFlow method has not been used
export async function createFlow(
  name: string,
  graph: FlowGraph
): Promise<Flow> {
  const json = await api(`/flows`, {
    method: "POST",
    body: JSON.stringify({ name, graph }),
  });
  const data: { ok: boolean; flow: Flow } = ensureOk(
    json,
    `creating flow ${name}`
  );
  return data.flow;
}

// TODO: updateFlow method has not been used
export async function updateFlow(
  id: string,
  patch: Partial<{ name?: string; graph?: FlowGraph }>
): Promise<{ ok: boolean; updated: boolean }> {
  const json = await api(`/flows/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({
      name: patch.name ?? undefined,
      graph: patch.graph
        ? { nodes: patch.graph.nodes ?? [], edges: patch.graph.edges ?? [] }
        : undefined,
    }),
  });
  const data = ensureOk(json, `updating flow ${id}`);
  return data;
}

/* -------------------- Clinic (legacy session APIs) -------------------- */

export type RunRequestBody = {
  agent_id?: string;
  input: string;
  source: string;
  config?: Record<string, any>;
};

// TODO: startRun method has not been used
export async function startRun(
  body: RunRequestBody
): Promise<StartRunResponse> {
  // Prefer the new agent run endpoint when agentId is present.
  if (body.agent_id) {
    return startAgentRun(body.agent_id, {
      input: body.input,
      source: body.source,
      config: body.config,
    });
  }

  // Fallback: if you still use /clinic/replay or legacy flow, handle elsewhere.
  throw new Error("agentId is required for startRun in Job6 backend");
}

export type SessionSummary = {
  request_id: string;
  run_id: string;
  status: string;
  model?: string | null;
  source?: string | null;
  tokens?: number | null;
  cost?: number | null;
  latency_ms?: number | null;
  started_at?: string | null;
  finished_at?: string | null;
};

export type RunSummary = {
  agent_id: string;
  status: string;
  latency_ms: number;
  tokens_in: number;
  tokens_out: number;
  tokens_total: number;
  cost_estimate_usd: number;
  model: string;
  source: string;
  started_at: string | null;
  finished_at: string | null;
};

export type Session = {
  request_id: string;
  run_id: string;
  events: { type: string; payload: Record<string, any>; ts: string }[];
  summary: RunSummary;
};

// TODO: listSessions method has not been used
export async function listSessions(
  limit = 50,
  offset = 0
): Promise<SessionSummary[]> {
  const json = await api(`/clinic/sessions?limit=${limit}&offset=${offset}`);
  const data: { ok: boolean; total: number; items: SessionSummary[] } =
    ensureOk(json, "listing clinic sessions");
  return data.items ?? [];
}

// TODO: getSessionByRequestId method has not been used
export async function getSessionByRequestId(
  request_id: string
): Promise<Session> {
  const json = await api(`/clinic/session/${encodeURIComponent(request_id)}`);
  const data: { ok: boolean; session: Session } = ensureOk(
    json,
    `loading clinic session ${request_id}`
  );
  return data.session;
}

// TODO: replaySession method has not been used
export async function replaySession(
  requestId: string
): Promise<StartRunResponse> {
  const json = await api(`/clinic/replay/${encodeURIComponent(requestId)}`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  //TODO: should I upload body uploaded here?
  const data = ensureOk(json, `replaying session ${requestId}`);
  return data;
}

// TODO: exportSession method has not been used
export async function exportSession(requestId: string): Promise<Session> {
  const json = await api(`/clinic/session/${encodeURIComponent(requestId)}`);
  const data: { ok: boolean; session: Session } = ensureOk(
    json,
    `exporting session ${requestId}`
  );

  return data.session;
}

/* ----------------------------------------------------- */
/* MCP                                                   */
/* ----------------------------------------------------- */

export type McpConnector = {
  id: string;
  name: string;
  enabled: boolean;
  meta: Record<string, any>;
  last_test_status: string;
  last_test_at: string;
};

export async function listConnectors(): Promise<McpConnector[]> {
  const json = await api(`/mcp/connectors`);
  const data: { ok: boolean; connectors: McpConnector[] } = ensureOk(
    json,
    "listing connectors"
  );
  return data.connectors;
}

export async function patchConnector(
  connector_id: string,
  body: Partial<McpConnector>
): Promise<{ ok: boolean; id: string; enabled: boolean }> {
  const json = await api(
    `/mcp/connectors/${encodeURIComponent(connector_id)}`,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    }
  );
  return ensureOk(json, `patching connector ${connector_id}`);
}

export async function testConnector(body: { connector_id: string }): Promise<{
  ok: boolean;
  connector_id: string;
  latency_ms: number;
  logs: string[];
}> {
  const json = await api(`/mcp/test`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return ensureOk(json, "testing connector");
}
