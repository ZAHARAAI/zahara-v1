import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Routes that never need a token — skip auto-guest entirely
const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/api/auth/login",
  "/api/auth/signup",
  "/api/auth/guest",
  "/api/auth/logout",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

function isAssetPath(pathname: string): boolean {
  return (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/public/") ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".ico")
  );
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Skip public routes and static assets — no guest token needed
  if (isPublicPath(pathname) || isAssetPath(pathname))
    return NextResponse.next();

  const token = req.cookies.get("zahara_access_token")?.value;

  // Token exists — user is either a real user or already has a guest token, let through
  if (token) return NextResponse.next();

  // No token on a private route — auto-provision a guest token so the demo
  // loop works without any login or setup
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL;

  if (!apiBase) {
    // Misconfigured environment — fall back to login
    return NextResponse.redirect(new URL("/login", req.url));
  }

  try {
    const guestRes = await fetch(`${apiBase}/auth/guest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });

    if (!guestRes.ok) {
      // Backend guest endpoint failed (e.g. guest user not seeded yet)
      // Fall back to login so the user can still access the app
      return NextResponse.redirect(new URL("/login", req.url));
    }

    const data = await guestRes.json();
    // console.log(data);
    const guestToken: string = data.access_token;

    if (!guestToken) {
      return NextResponse.redirect(new URL("/login", req.url));
    }

    // Continue to the requested page but inject the two guest cookies
    const response = NextResponse.next();

    // Main auth cookie — httpOnly so JS can't steal it
    response.cookies.set("zahara_access_token", guestToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24, // 24 h — matches guest token TTL
    });

    // Guest flag — NOT httpOnly so client components can read it for the banner
    response.cookies.set("zahara_is_guest", "true", {
      httpOnly: false,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24, // 24 h
    });

    return response;
  } catch {
    // Network error reaching the backend — fall back to login
    return NextResponse.redirect(new URL("/login", req.url));
  }
}
export const config = {
  /*
   * Match all routes EXCEPT:
   *   - /_next/ (static files, hot reload)
   *   - /favicon.ico
   *   - /public/ assets
   *
   * All other paths — including /, /builders, /clinic, /api/sse/* —
   * pass through the middleware so guest tokens can be provisioned.
   */
  matcher: ["/((?!_next/static|_next/image|favicon.ico|public/).*)"],
};
