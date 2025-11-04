/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from "zod";

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL as string;
const API_KEY = process.env.NEXT_PUBLIC_API_KEY as string;

const Retry = { max: 2, backoffMs: 400 };

export async function api(path: string, init: RequestInit = {}) {
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
}

// Flows
export const FlowItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  updatedAt: z.string().optional(),
});

export const FlowEnvelopeSchema = z.object({
  ok: z.boolean(),
  flow: z.object({
    id: z.string(),
    name: z.string(),
    graph: z.object({
      nodes: z.array(z.any()),
      edges: z.array(z.any()),
    }),
    updatedAt: z.string().optional(),
  }),
});

export const FlowListSchema = z.object({
  ok: z.boolean(),
  items: z.array(FlowItemSchema),
  page: z.number().optional(),
  pageSize: z.number().optional(),
  total: z.number().optional(),
});

export type FlowItem = z.infer<typeof FlowItemSchema>;
export type FlowEnvelope = z.infer<typeof FlowEnvelopeSchema>;
export type FlowList = z.infer<typeof FlowListSchema>;

export async function listFlows(owner: "me" | string = "me") {
  const res = await api(`/flows?owner=${owner}&page=1&pageSize=50`);
  const json = await res.json();
  return FlowListSchema.parse(json);
}

export async function createFlow(
  name: string,
  graph: { nodes: any[]; edges: any[] }
) {
  const res = await api(`/flows`, {
    method: "POST",
    body: JSON.stringify({ name, graph }),
  });
  const json = await res.json();
  return FlowEnvelopeSchema.parse(json);
}

export async function getFlow(id: string) {
  const res = await api(`/flows/${id}`);
  const json = await res.json();
  return FlowEnvelopeSchema.parse(json);
}

export async function updateFlow(
  id: string,
  name: string,
  graph: { nodes: any[]; edges: any[] }
) {
  const res = await api(`/flows/${id}`, {
    method: "PUT",
    body: JSON.stringify({ name, graph }),
  });
  const json = await res.json();
  return json;
}
