/* eslint-disable @typescript-eslint/no-explicit-any */
/* Merged API client: Job6 + existing endpoints */

import { api } from "@/actions/api";
import { AnyNodeData } from "@/components/Flow/types";
import { useRunUIStore } from "@/hooks/useRunUIStore";
import { Edge, Node } from "reactflow";

/**
 * Small helper: backend sometimes returns {ok:false, error:{...}} with 200,
 * while actions/api.ts throws on non-2xx. We normalize the 200+ok=false case here.
 */
function ensureOk(json: any, msg: string) {
  if (!json.ok) throw new Error(msg);
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
  status?: "active" | "paused" | "retired" | string | null;
  budget_daily_usd?: number | null;
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
export type AgentListItem = Agent;

export async function listAgents(): Promise<AgentListItem[]> {
  const json = await api(`/agents`);
  const data = ensureOk(json, "listing agents");
  return data.items ?? data;
}

export type CreateAgentRequest = {
  name: string;
  slug?: string;
  description?: string;
  spec?: Record<string, any>;
};

export async function createAgent(
  body: CreateAgentRequest,
): Promise<AgentSpec> {
  const json = await api(`/agents`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  const data = ensureOk(json, "creating agent");
  return data;
}

export async function getAgent(agent_id: string): Promise<AgentSpec> {
  const json = await api(`/agents/${encodeURIComponent(agent_id)}`);
  const data = ensureOk(json, "getting agent");
  return data;
}

export async function patchAgent(
  agent_id: string,
  body: Partial<
    Pick<Agent, "name" | "slug" | "description" | "status" | "budget_daily_usd">
  >,
): Promise<AgentSpec> {
  const json = await api(`/agents/${encodeURIComponent(agent_id)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  const data = ensureOk(json, "patching agent");
  return data;
}

export async function saveAgentSpec(
  agent_id: string,
  spec: Record<string, any>,
): Promise<AgentSpec> {
  const json = await api(`/agents/${encodeURIComponent(agent_id)}/spec`, {
    method: "POST",
    body: JSON.stringify({ spec }),
  });
  const data = ensureOk(json, "saving spec");
  return data;
}

export type FlowAgentUpsertParams = {
  /** If provided, update spec for existing agent. Otherwise create new. */
  agent_id?: string | null;
  /** Agent display name */
  name: string;
  slug?: string;
  /** Optional description */
  description?: string;

  /** Flow graph from ReactFlow */
  graph: {
    nodes: Node<AnyNodeData>[];
    edges: Edge[];
  };

  /** Extra metadata (entry node id, etc.) */
  meta?: Record<string, any>;
};

export async function upsertAgentFromFlow(
  params: FlowAgentUpsertParams,
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
    await patchAgent(params.agent_id, {
      name: params.name,
      description: params.description ?? null,
    });

    agentSpec = await saveAgentSpec(params.agent_id, spec);
  } else {
    agentSpec = await createAgent({
      name: params.name,
      slug: params.slug || params.name,
      description: params.description,
      spec,
    });
  }

  return agentSpec;
}

export async function deleteAgent(
  agent_id: string,
): Promise<{ ok: boolean; deleted: boolean }> {
  const json = await api(`/agents/${encodeURIComponent(agent_id)}`, {
    method: "DELETE",
  });
  const data = ensureOk(json, "deleting agent");
  return data;
}

/* ------------------------------------------------------------------ */
/* Runs                                                               */
/* ------------------------------------------------------------------ */

export type RunEventType =
  | "system"
  | "log"
  | "token"
  | "tool_call"
  | "tool_result"
  | "ping"
  | "done"
  | "error"
  | string;

export type RunEvent = {
  type: RunEventType;
  ts: string;
  message?: string;
  payload?: any;
  [k: string]: any;
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
  budget?: {
    budget_daily_usd: number;
    spent_today_usd: number;
    spent_today_is_approximate?: boolean;
    percent_used: number;
  } | null;
};

export type RetryRunResponse = {
  ok: boolean;
  new_run_id: string;
  retry_of: string;
};

export async function startAgentRun(
  agent_id: string,
  body: StartRunRequest,
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
  opts?: {
    onError?: (err: any) => void;
    signal?: AbortSignal;
    /** Optional override per run */
    autoCloseMs?: number;
    /** Optional fade duration */
    fadeMs?: number;
  },
) {
  const url = `/api/sse/runs/${encodeURIComponent(run_id)}`;
  const es = new EventSource(url);

  const pushToBuildModal = (ev: RunEvent) => {
    const st = useRunUIStore.getState();
    if (!st?.open) return;

    // always keep last 5 logs
    st.pushLog({
      type: ev.type ?? "log",
      ts: ev.ts ?? new Date().toISOString(),
      message: ev.message,
      payload: ev.payload,
    });

    if (ev.type === "done") {
      st.setPhase("finalizing", "Finalizing run…");
      st.setPhase("done", "Completed");

      const closeMs =
        typeof opts?.autoCloseMs === "number"
          ? opts.autoCloseMs
          : (st.autoCloseMs ?? 1000);

      st.safeHideAfter(closeMs, st.sessionId, opts?.fadeMs ?? 180);
    } else if (ev.type === "error") {
      const msg =
        (typeof ev.message === "string" && ev.message) ||
        (typeof ev.payload?.message === "string" && ev.payload.message) ||
        "Run failed";
      st.setError(msg);
      // no auto-close on error
    }
  };

  const safeEmit = (ev: Partial<RunEvent>) => {
    const merged: RunEvent = {
      type: (ev.type ?? "log") as RunEventType,
      ts: ev.ts ?? new Date().toISOString(),
      message: ev.message,
      payload: ev.payload,
      ...ev,
    };

    onEvent(merged);

    try {
      pushToBuildModal(merged);
    } catch {}
  };

  es.onmessage = (msg) => {
    try {
      const data = JSON.parse(msg.data ?? "{}");
      safeEmit({
        type: data.type ?? "log",
        payload: data.payload ?? data,
        message: data.message,
        ts: data.ts,
        ...data,
      });
    } catch {
      safeEmit({ type: "log", message: String(msg.data ?? "") });
    }
  };

  es.onerror = (e) => {
    opts?.onError?.(e);
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
  cost_is_approximate?: boolean | null;
  created_at: string;
};

export type RunListResponse = {
  ok: boolean;
  items: RunListItem[];
  total: number;
  limit: number;
  offset: number;
};

export async function listRuns(params?: {
  limit?: number;
  offset?: number;
  agent_id?: string;
  status?: "pending" | "running" | "success" | "error" | string;
}): Promise<RunListResponse> {
  const sp = new URLSearchParams();
  sp.set("limit", String(params?.limit ?? 50));
  sp.set("offset", String(params?.offset ?? 0));
  if (params?.agent_id) sp.set("agent_id", params.agent_id);
  if (params?.status) sp.set("status", params.status);

  const json = await api(`/runs?${sp.toString()}`);
  const data = ensureOk(json, "listing runs");
  return data;
}

export type RunDetail = {
  id: string;
  agent_id?: string | null;
  agent_spec_id?: string | null;
  retry_of_run_id?: string | null;
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
  cost_is_approximate?: boolean | null;
  error_message?: string | null;
  input: string;
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
  run_id: string,
): Promise<{ ok: boolean; run: RunDetail; events: RunEventDTO[] }> {
  const json = await api(`/runs/${encodeURIComponent(run_id)}`);
  const data = ensureOk(json, `loading run ${run_id}`);
  return data;
}

export async function retryRun(run_id: string): Promise<RetryRunResponse> {
  const json = await api(`/runs/${encodeURIComponent(run_id)}/retry`, {
    method: "POST",
  });
  return ensureOk(json, "retrying run");
}

export async function exportRunAsJson(run_id: string): Promise<any> {
  const json = await api(`/runs/${encodeURIComponent(run_id)}/export`);
  return ensureOk(json, "exporting run");
}

export type RunCancelResponse = {
  ok: boolean;
  run_id: string;
  status: string;
};

export async function cancelRun(run_id: string): Promise<RunCancelResponse> {
  const json = await api(`/runs/${encodeURIComponent(run_id)}/cancel`, {
    method: "POST",
  });
  return ensureOk(json, "cancelling run");
}

type DeleteRunResponse = {
  ok: boolean;
  run_id: string;
  deleted_events: number;
};

export async function deleteRun(run_id: string): Promise<DeleteRunResponse> {
  const json = await api(`/runs/${encodeURIComponent(run_id)}`, {
    method: "DELETE",
  });
  return ensureOk(json, "deleting run");
}

/* ----------------------------------------------------- */
/* Provider Keys                                         */
/* ----------------------------------------------------- */

export type ProviderKey = {
  id: string;
  provider: string;
  label: string;
  masked_key: string;
  last_test_status?: string | null;
  last_tested_at?: string | null;
  created_at: string;
  updated_at?: string | null;
};

type ProviderKeyListResponse = {
  ok: boolean;
  items: ProviderKey[];
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
  const json: { ok: boolean; provider_key: ProviderKey; masked_key: string } =
    await api("/provider_keys", {
      method: "POST",
      body: JSON.stringify(body),
    });

  return json.provider_key;
}

export async function deleteProviderKey(
  keyId: string,
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
  sha?: string | null,
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
    "listing connectors",
  );
  return data.connectors;
}

export async function patchConnector(
  connector_id: string,
  body: Partial<McpConnector>,
): Promise<{ ok: boolean; id: string; enabled: boolean }> {
  const json = await api(
    `/mcp/connectors/${encodeURIComponent(connector_id)}`,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    },
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

// job7 sprint functions
export type AgentStatsItem = {
  agent_id: string;
  name: string;
  slug: string;
  status?: "active" | "paused" | "retired" | string | null;
  budget_daily_usd?: number | null;

  // ✅ Job7
  spent_today_usd: number;
  spent_today_is_approximate?: boolean;

  runs: number;
  success_rate: number; // 0..1
  tokens_total: number;
  cost_total_usd: number;
  avg_latency_ms: number;
  p95_latency_ms: number;
};

export async function getAgentsStats(
  period: "7d" | "30d" | "all" = "7d",
): Promise<AgentStatsItem[]> {
  const json = await api(`/agents/stats?period=${encodeURIComponent(period)}`);
  const data = ensureOk(json, "loading agent stats");
  return data.items ?? [];
}

export type AgentStatsDetail = {
  ok: boolean;
  agent_id: string;
  period: "7d" | "30d" | "all" | string;
  runs: number;
  success_rate: number; // 0..1
  tokens_total: number;
  cost_total_usd: number;
  avg_latency_ms: number;
  p95_latency_ms: number;
  spent_today_usd?: number;
  spent_today_is_approximate?: boolean;
};

export async function getAgentStatsDetail(
  agent_id: string,
  period: "7d" | "30d" | "all" = "7d",
): Promise<AgentStatsDetail> {
  const json = await api(
    `/agents/${encodeURIComponent(agent_id)}/stats?period=${encodeURIComponent(
      period,
    )}`,
  );
  return ensureOk(json, "loading agent stats detail");
}

export async function killAgent(agent_id: string): Promise<{
  ok: boolean;
  agent_id: string;
  status: "paused" | string;
  cancelled_runs?: number;
}> {
  const json = await api(`/agents/${encodeURIComponent(agent_id)}/kill`, {
    method: "PATCH",
  });
  const data = ensureOk(json, "killing agent");
  return data;
}

export type RunsByDayPoint = {
  date: string; // YYYY-MM-DD
  runs: number;
  success: number;
  error: number;
  cancelled: number;
  cost_usd: number;
  tokens_total: number;
};

export type AgentStatsSummary = {
  ok: boolean;
  total_runs: number;
  success_rate: number;
  tokens_total: number;
  cost_total_usd: number;
  avg_latency_ms: number;
  p95_latency_ms: number;
  runs_by_day: RunsByDayPoint[];
};

export async function getAgentsStatsSummary(
  period: "7d" | "30d" | "all" = "7d",
): Promise<AgentStatsSummary> {
  const json = await api(
    `/agents/stats/summary?period=${encodeURIComponent(period)}`,
  );
  return ensureOk(json, "loading stats summary");
}

export type AuditLogItem = {
  id: string;
  event_type: string;
  entity_type?: string | null;
  entity_id?: string | null;
  payload?: any;
  created_at: string;
};

export async function listAudit(params?: {
  limit?: number;
  offset?: number;
  cursor?: string;
  type?: string;
  entity_type?: string;
  entity_id?: string;
  from?: string;
  to?: string;
}): Promise<{
  items: AuditLogItem[];
  total: number;
  next_cursor?: string | null;
}> {
  const sp = new URLSearchParams();
  if (params?.limit != null) sp.set("limit", String(params.limit));
  if (params?.offset != null) sp.set("offset", String(params.offset));
  if (params?.cursor) sp.set("cursor", params.cursor);
  if (params?.type) sp.set("type", params.type);
  if (params?.entity_type) sp.set("entity_type", params.entity_type);
  if (params?.entity_id) sp.set("entity_id", params.entity_id);
  if (params?.from) sp.set("from", params.from);
  if (params?.to) sp.set("to", params.to);

  const json = await api(`/audit?${sp.toString()}`);
  const data = ensureOk(json, "listing audit logs");
  return {
    items: data.items ?? [],
    total: data.total ?? 0,
    next_cursor: data.next_cursor ?? null,
  };
}
