import { NextResponse } from "next/server";
import { setAccessToken } from "@/lib/auth-cookies";

export async function POST(req: Request) {
  const body = await req.json();
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL!;
  const res = await fetch(`${apiBase}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) return NextResponse.json(data, { status: res.status });

  await setAccessToken(data.access_token);
  return NextResponse.json({ ok: true, user: data.user });
}
