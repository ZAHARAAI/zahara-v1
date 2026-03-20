import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAccessToken } from "./lib/auth-cookies";

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const token = await getAccessToken();

  if (token && (pathname === "/login" || pathname === "/register")) {
    const url = req.nextUrl.clone();
    url.pathname = "/builders";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

// Routes Proxy should not run on
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|.*\\.png$).*)"],
};
