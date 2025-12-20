/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { setAccessToken } from "@/lib/auth-cookies";

export async function POST(req: Request) {
  const body = await req.json();
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL!;

  const Retry = { max: 3, backoffMs: 200 };
  let last: any;

  for (let attempt = 0; attempt <= Retry.max; attempt++) {
    try {
      const res = await fetch(`${apiBase}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(res.statusText);

      await setAccessToken(data.access_token);
      return NextResponse.json({ ok: true, user: data.user });
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
