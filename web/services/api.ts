/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from "zod";

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL as string;
const TOKEN = process.env.JOB5_DEMO_TOKEN as string;

const Retry = { max: 2, backoffMs: 400 };

export const api = async (path: string, init: RequestInit = {}) => {
  let last: any;
  for (let attempt = 0; attempt <= Retry.max; attempt++) {
    try {
      const res = await fetch(`${BASE}${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TOKEN}`,
          ...(init.headers || {}),
        },
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return res;
    } catch (e) {
      last = e;
      if (attempt < Retry.max)
        await new Promise((r) =>
          setTimeout(r, Retry.backoffMs * (attempt + 1))
        );
    }
  }
  throw last;
};

export const FlowSchema = z.object({
  id: z.string().optional(),
  nodes: z.array(z.any()),
  edges: z.array(z.any()),
  updatedAt: z.string().optional(),
});

export type FlowDTO = z.infer<typeof FlowSchema>;
