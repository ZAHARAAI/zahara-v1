/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import { getAccessToken } from "@/lib/auth-cookies";

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL as string;
const Retry = { max: 2, backoffMs: 400 };

export const api = async (
  path: string,
  init: RequestInit = {},
): Promise<{ json?: any; error?: string }> => {
  const token = await getAccessToken();
  if (!token) return { error: "NO ACCESS TOKEN FOUND" };

  let last: string = "";
  for (let attempt = 0; attempt <= Retry.max; attempt++) {
    try {
      const res = await fetch(`${BASE}${path}`, {
        method: init.method ?? "GET",
        headers: {
          "Content-Type": "application/json",
          "x-jwt-token": token,
        },
        body: init.body,
        cache: "no-store",
      });

      if (!res.ok) {
        // Try to extract a meaningful error message from the response body
        let errorMsg = res.statusText;
        try {
          const body = await res.json();
          console.log(body);
          if (body?.error) errorMsg = body.error;
          else if (body?.detail?.error?.message === "string")
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
      // Don't retry on client errors (4xx) — only on network/5xx failures
      const isClientError =
        last === "Bad Request" ||
        last === "Not Found" ||
        last === "Unauthorized" ||
        last === "Forbidden" ||
        last === "Conflict" ||
        // already parsed body messages from 4xx
        last.includes("AGENT_NOT_ACTIVE") ||
        last.includes("BUDGET_EXCEEDED") ||
        last.includes("not found") ||
        last.includes("already exists");
      if (isClientError) break; // don't retry 4xx
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
