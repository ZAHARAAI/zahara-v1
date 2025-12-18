import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAccessToken } from "./lib/auth-cookies";

const PUBLIC_PATH_PREFIXES = [
  "/login",
  "/register",
  "/api",
  "/_next",
  "/favicon.ico",
];

function isPublicPath(pathname: string) {
  return PUBLIC_PATH_PREFIXES.some((p) => pathname.startsWith(p));
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPublicPath(pathname)) return NextResponse.next();

  // Respect toggle: when disabled, allow only auth pages and homepage content.
  if (process.env.JOB5_ENABLED !== "true") {
    // Let the public homepage render, but prevent accessing other protected routes.
    if (pathname === "/") return NextResponse.next();
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  const token = await getAccessToken();
  if (token) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!.*\\..*).*)"],
};
