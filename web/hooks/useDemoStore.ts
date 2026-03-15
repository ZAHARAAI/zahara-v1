"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { toast } from "sonner";
import { seedDemo, type SeedResponse } from "@/services/api";

// ── Types ─────────────────────────────────────────────────────────────────

export type DemoPhase = "idle" | "seeding" | "success" | "error";

export interface SeedResult {
  agents_created: number;
  runs_created: number;
  agent_ids: string[];
  seeded_at: string;
  message: string;
}

interface DemoState {
  phase: DemoPhase;
  result: SeedResult | null;
  errorMessage: string | null;
  notAvailable: boolean;
  succeededAt: number | null; // Date.now() when last seed succeeded

  // ── Cross-component reload signal ──────────────────────────────────────
  // Increments each time seed succeeds.
  // VibePage: useEffect(() => { loadLeftPane() }, [seedVersion])
  // Decouples store from VibePage without circular deps.
  seedVersion: number;

  // ── Actions ────────────────────────────────────────────────────────────
  seed: (opts?: { force?: boolean }) => Promise<void>;
  reset: () => void; // dev only — back to idle without deleting backend data
}

// ── SSR-safe localStorage wrapper ────────────────────────────────────────
const safeLocalStorage = createJSONStorage(() => {
  if (typeof window === "undefined") {
    // Server: no-op storage — persist reads nothing, writes nothing
    return {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    };
  }
  return localStorage;
});

// ── Store ─────────────────────────────────────────────────────────────────

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
        // EC-1: double-click guard
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
              agent_ids: (result as SeedResponse).agent_ids,
              seeded_at: (result as SeedResponse).seeded_at,
              message: (result as SeedResponse).message,
            },
            errorMessage: null,
            succeededAt: Date.now(),
            // Increment so VibePage's useEffect fires and reloads agents
            seedVersion: s.seedVersion + 1,
          }));

          toast.success(
            (result as SeedResponse).message || "Demo data ready ✓",
          );
        } catch (err) {
          const raw = (err as Error).message ?? "Failed to seed demo data";

          // 403 — endpoint not available in this environment
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
          // Intentionally keep seedVersion — backend data still exists
        }),
    }),

    {
      name: "zahara.demo",
      storage: safeLocalStorage,
      skipHydration: true,

      partialize: (s): Partial<DemoState> => ({
        // Never persist "seeding" — if the page closes mid-seed, reopen
        // should show idle, not a stuck spinner.
        phase: s.phase === "seeding" ? "idle" : s.phase,
        result: s.result,
        succeededAt: s.succeededAt,
        seedVersion: s.seedVersion,
        errorMessage: s.phase === "error" ? s.errorMessage : null,
      }),
    },
  ),
);

// ── Selector hooks (each subscribes only to what it needs) ────────────────

export const useDemoPhase = () => useDemoStore((s) => s.phase);
export const useSeedVersion = () => useDemoStore((s) => s.seedVersion);
export const useIsSeeded = () =>
  useDemoStore((s) => s.phase === "success" || s.seedVersion > 0);
export const useDemoNotAvailable = () => useDemoStore((s) => s.notAvailable);
