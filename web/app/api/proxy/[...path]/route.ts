import { NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth-cookies";

type Params = { params: Promise<{ path: string[] }> };

export const runtime = "nodejs";

function buildUrl(path: string[]) {
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL!;
  return `${apiBase}/${path.join("/")}`;
}

export async function GET(req: Request, { params }: Params) {
  const token = await getAccessToken();
  const url = new URL(req.url);
  const target = buildUrl((await params).path) + (url.search ? url.search : "");

  const r = await fetch(target, {
    method: "GET",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: "no-store",
  });

  // SSE passthrough: if event-stream, stream it
  const contentType = r.headers.get("content-type") || "";
  if (contentType.includes("text/event-stream")) {
    return new Response(r.body, {
      status: r.status,
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      },
    });
  }

  const data = await r.json().catch(() => ({}));
  return NextResponse.json(data, { status: r.status });
}

export async function POST(req: Request, { params }: Params) {
  const token = await getAccessToken();
  const target = buildUrl((await params).path);
  const body = await req.text();

  const r = await fetch(target, {
    method: "POST",
    headers: {
      "Content-Type": req.headers.get("content-type") || "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body,
    cache: "no-store",
  });

  const data = await r.json().catch(() => ({}));
  return NextResponse.json(data, { status: r.status });
}

export async function PATCH(req: Request, { params }: Params) {
  const token = await getAccessToken();
  const target = buildUrl((await params).path);
  const body = await req.text();

  const r = await fetch(target, {
    method: "PATCH",
    headers: {
      "Content-Type": req.headers.get("content-type") || "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body,
    cache: "no-store",
  });

  const data = await r.json().catch(() => ({}));
  return NextResponse.json(data, { status: r.status });
}

export async function PUT(req: Request, { params }: Params) {
  const token = await getAccessToken();
  const target = buildUrl((await params).path);
  const body = await req.text();

  const r = await fetch(target, {
    method: "PUT",
    headers: {
      "Content-Type": req.headers.get("content-type") || "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body,
    cache: "no-store",
  });

  const data = await r.json().catch(() => ({}));
  return NextResponse.json(data, { status: r.status });
}

export async function DELETE(req: Request, { params }: Params) {
  const token = await getAccessToken();
  const url = new URL(req.url);
  const target = buildUrl((await params).path) + (url.search ? url.search : "");

  const r = await fetch(target, {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: "no-store",
  });

  const data = await r.json().catch(() => ({}));
  return NextResponse.json(data, { status: r.status });
}
