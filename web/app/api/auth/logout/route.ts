import { NextResponse } from "next/server";
import { clearAccessToken } from "@/lib/auth-cookies";

export async function POST() {
  await clearAccessToken();
  return NextResponse.json({ ok: true });
}
