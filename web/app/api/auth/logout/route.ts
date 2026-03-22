import { NextResponse } from "next/server";
import { clearAccessToken, clearGuestFlag } from "@/lib/auth-cookies";

export async function POST() {
  // Clear both the auth token and the guest flag
  await clearAccessToken();
  await clearGuestFlag();

  // Redirect to root — proxy middleware will auto-provision a new guest token
  return NextResponse.json({ ok: true });
}
