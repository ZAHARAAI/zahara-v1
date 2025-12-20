/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth-cookies";

export async function GET() {
  const token = await getAccessToken();
  if (!token)
    return NextResponse.json({ ok: false, user: null }, { status: 401 });

  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL!;

  const Retry = { max: 3, backoffMs: 200 };
  let last: any;

  for (let attempt = 0; attempt <= Retry.max; attempt++) {
    try {
      const res = await fetch(`${apiBase}/auth/me`, {
        headers: { "x-jwt-token": token },
        cache: "no-store",
      });

      const data = await res.json();
      if (!res.ok) throw new Error(res.statusText);
      
      return NextResponse.json(data, { status: res.status });
    } catch (e) {
      last = (e as Error).message;
      if (attempt < Retry.max) {
        await new Promise((r) =>
          setTimeout(r, Retry.backoffMs * (attempt + 1))
        );
      }
    }
  }

  return NextResponse.json({ ok: false, error: last });
}
