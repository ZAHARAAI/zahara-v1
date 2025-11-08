/* eslint-disable @typescript-eslint/no-explicit-any */

import { api } from "@/actions/api";

function ensureOk<T extends { ok?: boolean; error?: any }>(
  json: T,
  hint: string
) {
  if (json && json.ok === false) {
    const msg = json.error?.message || `Request failed: ${hint}`;
    throw new Error(msg);
  }
  return json;
}

// Flows
export async function listFlows(owner: "me" | string = "me") {
  const json = await api(`/flows?owner=${owner}&page=1&pageSize=50`);
  const data = ensureOk(json, "fetching list flows");
  return data.files ? data : { ...data, files: data.items ?? [] };
}

export async function createFlow(
  name: string,
  graph: { nodes: any[]; edges: any[] }
) {
  const json = await api(`/flows`, {
    method: "POST",
    body: JSON.stringify({ name, graph }),
  });
  return ensureOk(json, "creating flow");
}

export async function getFlow(id: string) {
  const json = await api(`/flows/${id}`);
  return ensureOk(json, "fetching flow");
}

export async function updateFlow(
  id: string,
  name: string,
  graph: { nodes: any[]; edges: any[] }
) {
  const json = await api(`/flows/${id}`, {
    method: "PUT",
    body: JSON.stringify({ name, graph }),
  });
  return ensureOk(json, "updating flow");
}

// Files
export async function listFiles() {
  const json = await api("/files");
  return ensureOk(json, "listing files");
}

export async function readFile(path: string) {
  const json = await api(`/files/${encodeURIComponent(path)}`);
  return ensureOk(json, "reading file");
}

export async function writeFile(path: string, content: string, sha: string) {
  const json = await api(`/files/${encodeURIComponent(path)}`, {
    method: "PUT",
    body: JSON.stringify({ content, sha }),
  });
  return ensureOk(json, "updating file");
}

// Run + SSE
export async function startRun(entry: string, args: Record<string, any> = {}) {
  const json = await api(`/run`, {
    method: "POST",
    body: JSON.stringify({ entry, args }),
  });
  return ensureOk(json, "starting run");
}

export function openEventStream(
  url: string,
  onMessage: (data: any, type?: string) => void
) {
  const BASE = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.API_BASE_URL || "";
  // const full = `${BASE}${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`;
  const full = `${BASE}${url}`;
  let es = new EventSource(full, { withCredentials: false });
  let closed = false;

  es.onmessage = (e) => {
    try {
      onMessage(JSON.parse(e.data));
    } catch {}
  };

  es.addEventListener?.("status", (e: MessageEvent) => {
    try {
      onMessage(JSON.parse(e.data), "status");
    } catch {}
  });

  es.addEventListener?.("log", (e: MessageEvent) => {
    try {
      onMessage(JSON.parse(e.data), "log");
    } catch {}
  });

  es.addEventListener?.("done", (e: MessageEvent) => {
    try {
      onMessage(JSON.parse(e.data), "done");
    } catch {}
  });

  es.onerror = () => {
    es.close();
    if (closed) return;
    setTimeout(() => {
      if (!closed) es = openEventStream(url, onMessage) as any;
    }, 800 + Math.random() * 1800);
  };
  return () => {
    closed = true;
    es.close();
  };
}

export function streamRun(
  runId: string,
  onMessage: (data: any, type?: string) => void
) {
  return openEventStream(
    `/sse/stream?runId=${encodeURIComponent(runId)}`,
    onMessage
  );
}

/** Clinic **/
export async function listSessions() {
  const json = await api("/clinic/sessions");
  return ensureOk(json, "listing sessions");
}

export async function replaySession(sessionId: string) {
  const json = await api(`/clinic/replay/${encodeURIComponent(sessionId)}`);
  return ensureOk(json, "replaying session");
}

// TODO: this can be a large file, need to handle differently?
// TODO: this function is not used currently
export async function exportSession(sessionId: string) {
  const json = await api(`/clinic/export/${encodeURIComponent(sessionId)}`);
  return ensureOk(json, "exporting session");
}

/** MCP **/

export async function listConnectors() {
  const json = await api("/mcp/connectors");
  return ensureOk(json, "listing connectors");
}

export async function patchConnector(id: string, enabled: boolean) {
  const json = await api(`/mcp/connectors/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ enabled }),
  });
  return ensureOk(json, "patching connector");
}

export async function testConnector(id: string) {
  const json = await api(`/mcp/test`, {
    method: "POST",
    body: JSON.stringify({ connectorId: id }),
  });
  return ensureOk(json, "testing connector");
}
