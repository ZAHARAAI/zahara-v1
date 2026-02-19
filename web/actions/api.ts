/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import { getAccessToken } from "@/lib/auth-cookies";

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL as string;
const Retry = { max: 2, backoffMs: 400 };

export const api = async (path: string, init: RequestInit = {}) => {
  const token = await getAccessToken();
  if (!token) throw new Error("NO ACCESS TOKEN FOUND");

  let last: any;
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

      console.log(res);

      if (!res.ok) throw new Error(res.statusText);

      const json = await res.json();
      // console.log(json);
      return json;
    } catch (e) {
      last = (e as Error).message;
      if (attempt < Retry.max) {
        await new Promise((r) =>
          setTimeout(r, Retry.backoffMs * (attempt + 1)),
        );
      }
    }
  }
  console.log(last ?? "Unknown API error");
  throw new Error(last ?? "Unknown API error");
};
