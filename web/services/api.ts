/* eslint-disable @typescript-eslint/no-explicit-any */

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL as string;
const API_KEY = process.env.NEXT_PUBLIC_ZAHARA_API_KEY as string;

const Retry = { max: 2, backoffMs: 400 };

export async function api(path: string, init: RequestInit = {}) {
  let last: any;
  for (let attempt = 0; attempt <= Retry.max; attempt++) {
    try {
      const res = await fetch(`${BASE}${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": API_KEY,
          ...(init.headers || {}),
        },
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return res;
    } catch (e) {
      last = e;
      if (attempt < Retry.max)
        await new Promise((r) =>
          setTimeout(r, Retry.backoffMs * (attempt + 1))
        );
    }
  }
  throw last;
}

// Flows
export async function listFlows(owner: "me" | string = "me") {
  const res = await api(`/flows?owner=${owner}&page=1&pageSize=50`);
  const json = await res.json();
  return json.files ? json : { ...json, files: json.items ?? [] };
}

export async function createFlow(
  name: string,
  graph: { nodes: any[]; edges: any[] }
) {
  const res = await api(`/flows`, {
    method: "POST",
    body: JSON.stringify({ name, graph }),
  });
  return await res.json();
}

export async function getFlow(id: string) {
  const res = await api(`/flows/${id}`);
  return await res.json();
}

export async function updateFlow(
  id: string,
  name: string,
  graph: { nodes: any[]; edges: any[] }
) {
  const res = await api(`/flows/${id}`, {
    method: "PUT",
    body: JSON.stringify({ name, graph }),
  });
  return await res.json();
}

// Files
export async function listFiles() {
  const res = await api("/files");
  return await res.json();
}

export async function readFile(path: string) {
  const res = await api(`/files/${encodeURIComponent(path)}`);
  return await res.json();
}

export async function writeFile(path: string, content: string, sha: string) {
  const res = await api(`/files/${encodeURIComponent(path)}`, {
    method: "PUT",
    body: JSON.stringify({ content, sha }),
  });
  return await res.json();
}

// Run + SSE
export async function startRun(entry: string, args: Record<string, any> = {}) {
  const res = await api(`/run`, {
    method: "POST",
    body: JSON.stringify({ entry, args }),
  });
  return await res.json(); // { ok, runId }
}

export function openEventStream(
  url: string,
  onMessage: (data: any, type?: string) => void
) {
  const full = `${BASE}${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`;
  const es = new EventSource(full, { withCredentials: false });
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
    setTimeout(
      () => openEventStream(url, onMessage),
      500 + Math.random() * 1500
    );
  };
  return () => es.close();
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
  const res = await api("/clinic/sessions");
  return await res.json();
}

export async function replaySession(sessionId: string) {
  const res = await api(`/clinic/replay/${encodeURIComponent(sessionId)}`);
  return await res.json();
}

export async function exportSession(sessionId: string) {
  const res = await api(`/clinic/export/${encodeURIComponent(sessionId)}`);
  return await res.json();
}

/** MCP **/

export async function listConnectors() {
  const res = await api("/mcp/connectors");
  return await res.json();
}

export async function patchConnector(id: string, enabled: boolean) {
  const res = await api(`/mcp/connectors/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ enabled }),
  });
  return await res.json();
}

export async function testConnector(id: string) {
  const res = await api(`/mcp/test`, {
    method: "POST",
    body: JSON.stringify({ connectorId: id }),
  });
  return await res.json();
}
