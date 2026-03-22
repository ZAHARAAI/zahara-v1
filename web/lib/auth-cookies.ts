import { cookies } from "next/headers";

// ── Cookie names ─────────────────────────────────────────────────────────────
const TOKEN_COOKIE = "zahara_access_token";
const GUEST_COOKIE = "zahara_is_guest";

// ── Access token (httpOnly — never readable by client JS) ────────────────────

export async function setAccessToken(token: string) {
  (await cookies()).set(TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days for real users
  });
}

export async function clearAccessToken() {
  (await cookies()).set(TOKEN_COOKIE, "", {
    httpOnly: true,
    path: "/",
    maxAge: 0,
  });
}

export async function getAccessToken(): Promise<string | undefined> {
  return (await cookies()).get(TOKEN_COOKIE)?.value;
}

// ── Guest flag (NOT httpOnly — client components read it for the banner) ──────
//
// Set to "true" by proxy middleware when a guest token is provisioned.
// Cleared by login/signup route handlers when a real token is issued.

export async function setGuestFlag(isGuest: boolean) {
  if (isGuest) {
    (await cookies()).set(GUEST_COOKIE, "true", {
      httpOnly: false, // must be readable by client JS
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24, // 24 h — matches guest token TTL
    });
  } else {
    await clearGuestFlag();
  }
}

export async function clearGuestFlag() {
  (await cookies()).set(GUEST_COOKIE, "", {
    httpOnly: false,
    path: "/",
    maxAge: 0,
  });
}

export async function getIsGuestServer(): Promise<boolean> {
  return (await cookies()).get(GUEST_COOKIE)?.value === "true";
}
