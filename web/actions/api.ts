/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import {
  getAccessToken,
  setAccessToken,
  setGuestFlag,
} from "@/lib/auth-cookies";

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL as string;
const Retry = { max: 2, backoffMs: 400 };

/**
 * Refresh the guest token by calling the backend /auth/guest endpoint directly.
 * Used when a 401 is received — typically a guest token that expired after its 24h TTL.
 * Returns the new token on success, null on failure.
 */
async function tryRefreshGuestToken(): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}/auth/guest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.access_token) return null;
    await setAccessToken(data.access_token);
    await setGuestFlag(true);
    return data.access_token as string;
  } catch {
    return null;
  }
}

export const api = async (
  path: string,
  init: RequestInit = {},
): Promise<{ json?: any; error?: string }> => {
  let token = await getAccessToken();
  let guestRefreshAttempted = false;

  let last: string = "";
  for (let attempt = 0; attempt <= Retry.max; attempt++) {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        // Merge caller-supplied headers (e.g. Idempotency-Key)
        ...(init.headers as Record<string, string> | undefined),
      };

      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch(`${BASE}${path}`, {
        method: init.method ?? "GET",
        headers,
        body: init.body,
        cache: "no-store",
      });

      // ── 401: try to refresh guest token once then retry ────────────────
      if (res.status === 401 && !guestRefreshAttempted) {
        guestRefreshAttempted = true;
        const newToken = await tryRefreshGuestToken();
        if (newToken) {
          token = newToken;
          attempt--; // don't count this as a retry
          continue;
        }
        return { error: "Session expired — please log in again." };
      }

      if (!res.ok) {
        let errorMsg = res.statusText;
        try {
          const body = await res.json();
          console.log(body);
          if (typeof body?.error === "string") errorMsg = body.error;
          else if (typeof body?.error?.message === "string")
            errorMsg = body.error.message;
          else if (typeof body?.detail?.error?.message === "string")
            errorMsg = body.detail.error.message;
          else if (typeof body?.detail === "string") errorMsg = body.detail;
        } catch {
          // ignore parse errors — keep statusText
        }
        throw new Error(errorMsg);
      }

      const json = await res.json();
      return { json };
    } catch (e) {
      last = (e as Error).message;
      const isClientError =
        last === "Bad Request" ||
        last === "Not Found" ||
        last === "Unauthorized" ||
        last === "Forbidden" ||
        last === "Conflict" ||
        last === "Session expired — please log in again." ||
        last.includes("AGENT_NOT_ACTIVE") ||
        last.includes("BUDGET_EXCEEDED") ||
        last.includes("not found") ||
        last.includes("already exists") ||
        last.includes("already_seeded");
      if (isClientError) break;
      if (attempt < Retry.max) {
        await new Promise((r) =>
          setTimeout(r, Retry.backoffMs * (attempt + 1)),
        );
      }
    }
  }
  console.log(last || "Unknown API error");
  return { error: last || "Unknown API error" };
};
