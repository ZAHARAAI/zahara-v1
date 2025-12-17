import { NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth-cookies";

export async function GET() {
  const token = await getAccessToken();
  if (!token)
    return NextResponse.json({ ok: false, user: null }, { status: 401 });

  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL!;
  const res = await fetch(`${apiBase}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
