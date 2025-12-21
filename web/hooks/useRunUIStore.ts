/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { create } from "zustand";

export type RunUILogEvent = {
  type: string;
  ts: string;
  message?: string;
  payload?: any;
};

export type RunUIPhase = "idle" | "running" | "finalizing" | "done" | "error";

type ShowOptions = {
  autoCloseMs?: number; // configurable per run
};

type RunUIState = {
  open: boolean;
  title: string;
  subtitle?: string;

  phase: RunUIPhase;
  errorMessage?: string;

  logs: RunUILogEvent[];

  /** Increments each time show() is called, so scheduled closes don't affect new runs */
  sessionId: number;

  /** Fade-out animation flag */
  isClosing: boolean;

  /** Auto-close delay for done state (per run) */
  autoCloseMs: number | null;

  setOpen: (open: boolean) => void;

  show: (title: string, subtitle?: string, opts?: ShowOptions) => void;
  hide: () => void;
  hideWithFade: (fadeMs?: number) => void;

  setPhase: (phase: RunUIPhase, subtitle?: string) => void;
  setError: (message: string) => void;

  clearLogs: () => void;
  pushLog: (ev: RunUILogEvent) => void;

  /** Only hides if session still matches (prevents auto-close when a new run starts) */
  safeHideAfter: (ms: number, sessionId: number, fadeMs?: number) => void;
};

export const useRunUIStore = create<RunUIState>((set, get) => ({
  open: false,
  title: "BUILD",
  subtitle: undefined,
  phase: "idle",
  errorMessage: undefined,
  logs: [],
  sessionId: 0,
  isClosing: false,
  autoCloseMs: null,

  setOpen: (open) => set({ open }),

  show: (title, subtitle, opts) =>
    set((s) => ({
      open: true,
      title,
      subtitle,
      phase: "running",
      errorMessage: undefined,
      logs: [],
      sessionId: s.sessionId + 1,
      isClosing: false,
      autoCloseMs:
        typeof opts?.autoCloseMs === "number" ? opts.autoCloseMs : 1000, // default
    })),

  hide: () =>
    set({
      open: false,
      subtitle: undefined,
      phase: "idle",
      errorMessage: undefined,
      logs: [],
      isClosing: false,
      autoCloseMs: null,
    }),

  hideWithFade: (fadeMs = 180) => {
    // If already closed, nothing to do
    if (!get().open) return;

    set({ isClosing: true });
    setTimeout(() => {
      // Only hide if still closing (modal might have been reopened)
      const s = get();
      if (s.isClosing) {
        s.hide();
      }
    }, fadeMs);
  },

  setPhase: (phase, subtitle) =>
    set((s) => ({
      phase,
      subtitle: subtitle ?? s.subtitle,
      errorMessage: phase === "error" ? s.errorMessage : undefined,
    })),

  setError: (message) =>
    set({
      phase: "error",
      errorMessage: message,
      subtitle: "Run failed",
      // do not auto-close on error
    }),

  clearLogs: () => set({ logs: [] }),

  pushLog: (ev) =>
    set((s) => {
      const next = [...(s.logs ?? []), ev];
      const trimmed = next.length > 5 ? next.slice(-5) : next;
      return { logs: trimmed };
    }),

  safeHideAfter: (ms, sessionId, fadeMs = 180) => {
    setTimeout(() => {
      const s = get();
      // Prevent auto-close if another run started (session changed)
      if (!s.open) return;
      if (s.sessionId !== sessionId) return;
      if (s.phase !== "done") return;
      s.hideWithFade(fadeMs);
    }, ms);
  },
}));
