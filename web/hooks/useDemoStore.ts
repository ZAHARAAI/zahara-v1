"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { toast } from "sonner";
import { seedDemo, type SeedResponse } from "@/services/api";

export type DemoPhase = "idle" | "seeding" | "success" | "error";

export interface SeedResult {
  agents_created: number;
  runs_created: number;
  /**
   * Optional: the Job 8 backend proof shows /dev/seed no longer returns
   * agent_ids. DemoControls falls back to listAgents() when this is empty.
   */
  agent_ids: string[];
  /** Number of workspace files written (new in Job 8 backend). */
  files_written?: number;
  /** Guest user DB id (new in Job 8 backend). */
  guest_user_id?: number;
  seeded_at: string;
  message: string;
}

interface DemoState {
  phase: DemoPhase;
  result: SeedResult | null;
  errorMessage: string | null;
  notAvailable: boolean;
  succeededAt: number | null;
  seedVersion: number;
  seed: (opts?: { force?: boolean }) => Promise<void>;
  reset: () => void;
}

const safeLocalStorage = createJSONStorage(() => {
  if (typeof window === "undefined") {
    return { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  }
  return localStorage;
});

export const useDemoStore = create<DemoState>()(
  persist(
    (set, get) => ({
      phase: "idle",
      result: null,
      errorMessage: null,
      notAvailable: false,
      succeededAt: null,
      seedVersion: 0,

      seed: async (opts) => {
        if (get().phase === "seeding") return;
        set({ phase: "seeding", errorMessage: null });

        try {
          const [result] = await Promise.all([
            seedDemo({ force: opts?.force ?? false }),
            new Promise<void>((r) => setTimeout(r, 400)),
          ]);

          set((s) => ({
            phase: "success",
            result: {
              agents_created: (result as SeedResponse).agents_created,
              runs_created: (result as SeedResponse).runs_created,
              // New backend may not return agent_ids — default to []
              agent_ids: (result as SeedResponse).agent_ids ?? [],
              files_written: (result as SeedResponse).files_written,
              guest_user_id: (result as SeedResponse).guest_user_id,
              seeded_at: (result as SeedResponse).seeded_at,
              message: (result as SeedResponse).message,
            },
            errorMessage: null,
            succeededAt: Date.now(),
            seedVersion: s.seedVersion + 1,
          }));

          toast.success(
            (result as SeedResponse).message || "Demo data ready ✓",
          );
        } catch (err) {
          const raw = (err as Error).message ?? "Failed to seed demo data";
          const notAvailable =
            raw === "Forbidden" ||
            raw.toLowerCase().includes("not available") ||
            raw.toLowerCase().includes("forbidden");
          set({ phase: "error", errorMessage: raw, notAvailable });
          if (notAvailable) {
            toast.error("Demo seed is only available in development mode.");
          } else {
            toast.error(raw);
          }
        }
      },

      reset: () =>
        set({
          phase: "idle",
          result: null,
          errorMessage: null,
          succeededAt: null,
          notAvailable: false,
        }),
    }),

    {
      name: "zahara.demo",
      storage: safeLocalStorage,
      skipHydration: true,
      partialize: (s): Partial<DemoState> => ({
        phase: s.phase === "seeding" ? "idle" : s.phase,
        result: s.result,
        succeededAt: s.succeededAt,
        seedVersion: s.seedVersion,
        errorMessage: s.phase === "error" ? s.errorMessage : null,
      }),
    },
  ),
);

export const useDemoPhase = () => useDemoStore((s) => s.phase);
export const useSeedVersion = () => useDemoStore((s) => s.seedVersion);
export const useIsSeeded = () =>
  useDemoStore((s) => s.phase === "success" || s.seedVersion > 0);
export const useDemoNotAvailable = () => useDemoStore((s) => s.notAvailable);
