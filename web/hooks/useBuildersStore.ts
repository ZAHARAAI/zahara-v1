"use client";

import { create } from "zustand";

export type BuilderMode = "vibe" | "flow" | "pro";

export interface ActiveRun {
  runId: string;
  status: "pending" | "running" | "success" | "error" | "cancelled";
  startedAt: number; // Date.now() — optimistic
  tokensIn?: number;
  tokensOut?: number;
  costEstimateUsd?: number;
  costIsApproximate?: boolean;
  latencyMs?: number;
  errorMessage?: string;
  source?: BuilderMode;
}

interface BuildersState {
  // ── Mode ──────────────────────────────────────────────────────────
  mode: BuilderMode;
  setMode: (m: BuilderMode) => void;

  // ── Shared context — survives mode switches ───────────────────────
  selectedAgentId: string | null;
  selectedRunId: string | null;
  setSelectedAgentId: (id: string | null) => void;
  setSelectedRunId: (id: string | null) => void;

  // ── Active run (optimistic, not persisted to URL) ─────────────────
  activeRun: ActiveRun | null;
  setActiveRun: (
    updater: ActiveRun | null | ((prev: ActiveRun | null) => ActiveRun | null),
  ) => void;
  clearActiveRun: () => void;

  // ── Hydration flag — prevents SSR mismatch ────────────────────────
  _hydrated: boolean;
  _setHydrated: () => void;
}

export const useBuildersStore = create<BuildersState>((set) => ({
  mode: "vibe",
  setMode: (mode) => set({ mode }),

  selectedAgentId: null,
  selectedRunId: null,
  setSelectedAgentId: (selectedAgentId) => set({ selectedAgentId }),
  setSelectedRunId: (selectedRunId) => set({ selectedRunId }),

  activeRun: null,
  setActiveRun: (updater) =>
    set((s) => ({
      activeRun: typeof updater === "function" ? updater(s.activeRun) : updater,
    })),
  clearActiveRun: () => set({ activeRun: null }),

  _hydrated: false,
  _setHydrated: () => set({ _hydrated: true }),
}));

// ── Selector hooks (prevent unnecessary re-renders) ───────────────────────
export const useBuilderMode = () => useBuildersStore((s) => s.mode);
export const useActiveRun = () => useBuildersStore((s) => s.activeRun);
export const useSelectedAgentId = () =>
  useBuildersStore((s) => s.selectedAgentId);
