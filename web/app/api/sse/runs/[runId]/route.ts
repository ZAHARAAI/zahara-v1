import { getAccessToken } from "@/lib/auth-cookies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

type Params = { params: Promise<{ runId: string }> };

export async function GET(req: Request, { params }: Params) {
  const { runId } = await params;
  const token = await getAccessToken();
  if (!token) {
    return new Response("unauthorized", { status: 401 });
  }

  const base = mustEnv("NEXT_PUBLIC_API_BASE_URL").replace(/\/$/, "");
  const url = new URL(req.url);
  // Allow forwarding optional reconnect params like ?after_event_id=123
  const upstreamUrl = new URL(
    `${base}/runs/${encodeURIComponent(runId)}/events`,
  );
  url.searchParams.forEach((v, k) => upstreamUrl.searchParams.set(k, v));
  const upstream = upstreamUrl.toString();

  // Optional: forward request-id for traceability (if your backend/router supports it)
  const incomingRid = req.headers.get("x-request-id");
  const lastEventId = req.headers.get("last-event-id");
  const headers: Record<string, string> = {
    "x-jwt-token": token,
    Accept: "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  };
  if (incomingRid) headers["X-Request-Id"] = incomingRid;
  // SSE resume header
  if (lastEventId) headers["Last-Event-ID"] = lastEventId;

  const res = await fetch(upstream, {
    method: "GET",
    headers,
    cache: "no-store",
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    return new Response(text || "upstream_error", { status: res.status });
  }

  // Pass-through stream (no buffering)
  return new Response(res.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
