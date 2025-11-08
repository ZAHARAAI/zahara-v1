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
  const res = await api(`/flows?owner=${owner}&page=1&pageSize=50`);
  const json = await res.json();
  const data = ensureOk(json, "fetching list flows");
  return data.files ? data : { ...data, files: data.items ?? [] };
}

export async function createFlow(
  name: string,
  graph: { nodes: any[]; edges: any[] }
) {
  const res = await api(`/flows`, {
    method: "POST",
    body: JSON.stringify({ name, graph }),
  });
  const json = await res.json();
  return ensureOk(json, "creating flow");
}

export async function getFlow(id: string) {
  const res = await api(`/flows/${id}`);
  const json = await res.json();
  return ensureOk(json, "fetching flow");
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
  const json = await res.json();
  return ensureOk(json, "updating flow");
}

// Files
export async function listFiles() {
  const res = await api("/files");
  const json = await res.json();
  return ensureOk(json, "listing files");
}

export async function readFile(path: string) {
  const res = await api(`/files/${encodeURIComponent(path)}`);
  const json = await res.json();
  return ensureOk(json, "reading file");
}

export async function writeFile(path: string, content: string, sha: string) {
  const res = await api(`/files/${encodeURIComponent(path)}`, {
    method: "PUT",
    body: JSON.stringify({ content, sha }),
  });
  const json = await res.json();
  return ensureOk(json, "updating file");
}

// Run + SSE
export async function startRun(entry: string, args: Record<string, any> = {}) {
  const res = await api(`/run`, {
    method: "POST",
    body: JSON.stringify({ entry, args }),
  });
  const json = await res.json(); // { ok, runId }
  return ensureOk(json, "starting run");
}

export function openEventStream(
  url: string,
  onMessage: (data: any, type?: string) => void
) {
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
  const res = await api("/clinic/sessions");
  const json = await res.json();
  return ensureOk(json, "listing sessions");
}

export async function replaySession(sessionId: string) {
  const res = await api(`/clinic/replay/${encodeURIComponent(sessionId)}`);
  const json = await res.json();
  return ensureOk(json, "replaying session");
}


// TODO: this can be a large file, need to handle differently?
// TODO: this function is not used currently
export async function exportSession(sessionId: string) {
  const res = await api(`/clinic/export/${encodeURIComponent(sessionId)}`);
  const json = await res.json();
  return ensureOk(json, "exporting session");
}

/** MCP **/

export async function listConnectors() {
  const res = await api("/mcp/connectors");
  const json = await res.json();
  return ensureOk(json, "listing connectors");
}

export async function patchConnector(id: string, enabled: boolean) {
  const res = await api(`/mcp/connectors/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ enabled }),
  });
  const json = await res.json();
  return ensureOk(json, "patching connector");
}

export async function testConnector(id: string) {
  const res = await api(`/mcp/test`, {
    method: "POST",
    body: JSON.stringify({ connectorId: id }),
  });
  const json = await res.json();
  return ensureOk(json, "testing connector");
}
