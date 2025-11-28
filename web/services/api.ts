/* eslint-disable @typescript-eslint/no-explicit-any */

import { api } from "@/actions/api";
import { AnyNodeData } from "@/components/Flow/types";
import { Edge, Node } from "reactflow";

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

export const RUN_EVENT_TYPES = [
  "log",
  "metric",
  "status",
  "heartbeat",
  "done",
  "error",
] as const;

export type RunEventType = (typeof RUN_EVENT_TYPES)[number];

export interface RunEventPayload {
  tokens?: number;
  cost?: number;
  latency_ms?: number;
  latencyMs?: number;
  level?: string;
  message?: string;
  status?: string;
  [key: string]: any;
}

/** Shape of a single SSE event coming from /events/{run_id}. */
export interface RunEvent {
  /**
   * Normalized event type, guaranteed to be one of RUN_EVENT_TYPES.
   * If the backend ever emits a new type, it will be surfaced via a runtime
   * warning and ignored until the union is updated, so we notice the change.
   */
  type: RunEventType;
  ts?: string;
  runId?: string;
  status?: string;
  requestId?: string;
  error?: string;
  /**
   * Optional human-readable message, commonly present on "log" / "status" /
   * "error" events.
   */
  message?: string;
  /**
   * Optional severity level for log-like events.
   */
  level?: "debug" | "info" | "warn" | "error" | (string & {});
  /**
   * Optional structured payload for metrics and other rich events.
   */
  payload?: RunEventPayload;
  [key: string]: any;
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

export function streamRun(
  runId: string,
  onEvent: (event: RunEvent) => void
): () => void {
  if (!runId) throw new Error("runId is required for SSE");
  const SSE_BASE = process.env.NEXT_PUBLIC_API_BASE_URL as string;

  if (!SSE_BASE) {
    console.warn(
      "NEXT_PUBLIC_API_BASE_URL is not set; SSE URL may be incorrect."
    );
  }

  const url = `${SSE_BASE.replace(/\/$/, "")}/events/${encodeURIComponent(
    runId
  )}`;

  let es: EventSource | null = new EventSource(url, { withCredentials: false });
  let closed = false;

  const makeHandler = (eventType: RunEventType) => {
    return (evt: MessageEvent<string>): void => {
      if (!evt.data) return;

      try {
        const raw = JSON.parse(evt.data) as Record<string, any>;
        const rawType = (raw.type ?? eventType) as string;

        if (!RUN_EVENT_TYPES.includes(rawType as RunEventType)) {
          console.warn(
            "[streamRun] Received unknown SSE event type",
            rawType,
            raw
          );
          // Ignore unknown types so the UI doesn't break silently; this also
          // makes backend shape changes visible during development.
          return;
        }

        const normalizedType = rawType as RunEventType;

        const enriched: RunEvent = {
          type: normalizedType,
          ...raw,
        };

        onEvent(enriched);
      } catch (err) {
        console.error("Failed to parse SSE event", err, evt.data);
      }
    };
  };

  const attachListeners = () => {
    if (!es) return;
    RUN_EVENT_TYPES.forEach((t) => {
      es!.addEventListener(t, makeHandler(t));
    });

    es.onerror = (err) => {
      console.warn("SSE error, will attempt reconnect", err);
      es?.close();
      if (closed) return;

      // Auto-reconnect ≤ 3s per spec
      setTimeout(() => {
        if (closed) return;
        es = new EventSource(url);
        attachListeners();
      }, 1000 + Math.random() * 1500);
    };
  };

  attachListeners();

  return () => {
    closed = true;
    es?.close();
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
