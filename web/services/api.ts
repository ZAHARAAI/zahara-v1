/* eslint-disable @typescript-eslint/no-explicit-any */

import { api } from "@/actions/api";

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL as string;

function ensureOk<T extends { ok?: boolean; error?: any }>(
  json: T,
  hint: string,
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

export type FsItem = {
  path: string;
  type: "file" | "dir";
  size?: number;
  modified?: string;
};

export async function listFiles(): Promise<FsItem[]> {
  const json = await api(`/files/list`);
  ensureOk(json, "listing files");
  return json.items ?? [];
}

export async function readFile(path: string): Promise<{
  ok: boolean;
  path: string;
  content: string;
  sha: string;
}> {
  const json = await api(`/files/read?path=${encodeURIComponent(path)}`);
  return ensureOk(json, `reading file ${path}`);
}

export async function writeFile(
  path: string,
  content: string,
  sha: string,
): Promise<{ ok: boolean; path: string; sha: string }> {
  const json = await api(`/files/write`, {
    method: "POST",
    body: JSON.stringify({ path, content, sha }),
  });
  return ensureOk(json, `writing file ${path}`);
}

/* ----------------------------------------------------- */
/* Flows (Flow Builder)                                  */
/* ----------------------------------------------------- */

export type FlowGraph = {
  nodes: any[];
  edges: any[];
  [k: string]: any;
};

export type FlowSummary = {
  id: string;
  name: string;
  updatedAt?: string;
};

export async function listFlows(): Promise<FlowSummary[]> {
  const json = await api(`/flows`);
  ensureOk(json, "listing flows");
  return json.items ?? [];
}

export async function getFlow(id: string): Promise<{
  ok: boolean;
  id: string;
  name: string;
  graph: FlowGraph;
}> {
  const json = await api(`/flows/${id}`);
  return ensureOk(json, `loading flow ${id}`);
}

export async function createFlow(
  name: string,
  graph: FlowGraph,
): Promise<{
  ok: boolean;
  id: string;
  name: string;
  graph: FlowGraph;
}> {
  const json = await api(`/flows`, {
    method: "POST",
    body: JSON.stringify({ name, graph }),
  });
  return ensureOk(json, `creating flow`);
}

export async function updateFlow(
  id: string,
  body: { name?: string; graph?: FlowGraph },
): Promise<{
  ok: boolean;
  id: string;
  name: string;
  graph: FlowGraph;
}> {
  const json = await api(`/flows/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
  return ensureOk(json, `updating flow ${id}`);
}

/* ----------------------------------------------------- */
/* Run + SSE (Pro + Clinic + AG-UI)                      */
/* ----------------------------------------------------- */

export async function startRun(payload: any): Promise<{
  ok: boolean;
  runId: string;
  requestId: string;
}> {
  const json = await api(`/run`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return ensureOk(json, "starting run");
}

export function openEventStream(
  url: string,
  onMessage: (data: any, type?: string) => void,
) {
  const full = `${BASE}${url}`;
  let es = new EventSource(full, { withCredentials: false });
  let closed = false;

  const handle = (e: MessageEvent, type?: string) => {
    try {
      const data = JSON.parse(e.data);
      onMessage(data, type);
    } catch {
      // ignore bad payload
    }
  };

  es.onmessage = (e) => handle(e);

  ["status", "log", "metric", "done"].forEach((type) => {
    es.addEventListener(type, (e) =>
      handle(e as MessageEvent, type as string),
    );
  });

  es.onerror = () => {
    es.close();
    if (closed) return;
    setTimeout(() => {
      if (!closed) {
        es = openEventStream(url, onMessage) as any;
      }
    }, 800 + Math.random() * 1800);
  };

  return () => {
    closed = true;
    es.close();
  };
}

export function streamRun(
  runId: string,
  onMessage: (data: any, type?: string) => void,
) {
  return openEventStream(`/events/${encodeURIComponent(runId)}`, onMessage);
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

export async function listSessions(): Promise<SessionSummary[]> {
  const json = await api(`/clinic/sessions`);
  ensureOk(json, "listing sessions");
  return json.items ?? [];
}

export async function getSessionByRequestId(requestId: string): Promise<{
  ok: boolean;
  session: {
    request_id: string;
    run_id: string;
    events: { type: string; payload: any; ts?: string }[];
    summary: any;
  };
}> {
  const json = await api(`/clinic/session/${encodeURIComponent(requestId)}`);
  return ensureOk(json, `getting session ${requestId}`);
}

export async function replaySession(
  requestId: string,
): Promise<{ ok: boolean; runId: string; requestId: string }> {
  const json = await api(`/clinic/replay/${encodeURIComponent(requestId)}`, {
    method: "POST",
  });
  return ensureOk(json, `replaying session ${requestId}`);
}

export async function exportSession(requestId: string) {
  // simplest: just re-use getSession and let the caller download JSON
  return getSessionByRequestId(requestId);
}

/* ----------------------------------------------------- */
/* MCP                                                   */
/* ----------------------------------------------------- */

export type Connector = {
  id: string;
  name: string;
  enabled: boolean;
  status?: string;
};

export async function listConnectors(): Promise<Connector[]> {
  const json = await api(`/mcp/connectors`);
  ensureOk(json, "listing connectors");
  return json.connectors ?? [];
}

export async function patchConnector(
  id: string,
  enabled: boolean,
): Promise<Connector> {
  const json = await api(`/mcp/connectors/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ enabled }),
  });
  ensureOk(json, "updating connector");
  return json;
}

export async function testConnector(id: string) {
  const json = await api(`/mcp/test`, {
    method: "POST",
    body: JSON.stringify({ connectorId: id }),
  });
  return ensureOk(json, "testing connector");
}
