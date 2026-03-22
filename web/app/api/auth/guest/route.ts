/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { setAccessToken, setGuestFlag } from "@/lib/auth-cookies";

/**
 * POST /api/auth/guest
 *
 * Calls the backend POST /auth/guest endpoint, sets the auth cookie and
 * guest flag, and returns { ok: true, is_guest: true }.
 *
 * Used by the frontend when it needs to explicitly refresh a guest session
 * (e.g. after expiry). The automatic provisioning happens in proxy.ts.
 */
export async function POST() {
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL!;

  try {
    const res = await fetch(`${apiBase}/auth/guest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });

    const data = await res.json();

    if (!res.ok || !data.access_token) {
      return NextResponse.json(
        {
          ok: false,
          error: data?.error?.message ?? "Failed to get guest token",
        },
        { status: res.status || 500 },
      );
    }

    await setAccessToken(data.access_token);
    await setGuestFlag(true);

    return NextResponse.json({
      ok: true,
      is_guest: true,
      expires_in: data.expires_in ?? 86400,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Network error" },
      { status: 500 },
    );
  }
}
