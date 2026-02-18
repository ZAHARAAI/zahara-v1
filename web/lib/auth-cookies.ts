import { cookies } from "next/headers";

const COOKIE_NAME = "zahara_access_token";

export async function setAccessToken(token: string) {
  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearAccessToken() {
  (await cookies()).set(COOKIE_NAME, "", {
    httpOnly: true,
    path: "/",
    maxAge: 0,
  });
}

export async function getAccessToken(): Promise<string | undefined> {
  return (await cookies()).get(COOKIE_NAME)?.value;
}
