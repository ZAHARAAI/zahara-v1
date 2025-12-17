import { NextRequest, NextResponse } from "next/server";
import { avoidRoutes } from "./lib/utilities";
import { getAccessToken } from "./lib/auth-cookies";

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const isAvoiding = avoidRoutes.some((route) => path.startsWith(route));

  const token = await getAccessToken();

  if (token && isAvoiding) {
    return NextResponse.redirect(new URL("/", req.nextUrl));
  }

  if (!token && !isAvoiding) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  return NextResponse.next();
}

// Routes Middleware should not run on
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|.*\\.png$).*)"],
};
