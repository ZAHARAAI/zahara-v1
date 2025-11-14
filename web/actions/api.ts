/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

const BASE = process.env.API_BASE_URL as string;
const API_KEY = process.env.ZAHARA_API_KEY as string;

const Retry = { max: 2, backoffMs: 400 };

export const api = async (path: string, init: RequestInit = {}) => {
  let last: any;
  for (let attempt = 0; attempt <= Retry.max; attempt++) {
    try {
      const res = await fetch(`${BASE}${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": API_KEY,
          ...(init.headers || {}),
        },
        cache: "no-store",
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`${res.status} ${res.statusText} – ${text}`);
      }
      return await res.json();
    } catch (e) {
      last = (e as Error).message;
      if (attempt < Retry.max) {
        await new Promise((r) =>
          setTimeout(r, Retry.backoffMs * (attempt + 1))
        );
      }
    }
  }
  throw new Error(last ?? "Unknown API error");
};
