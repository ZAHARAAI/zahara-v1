/* eslint-disable @typescript-eslint/no-explicit-any */
import { create } from "zustand";

export type RunEvent = {
  type: string;
  level?: "info" | "warn" | "error";
  step?: string;
  message?: string;
  duration?: number;
  tokens?: number;
  cost?: number;
  [k: string]: any;
};

type Bus = {
  runId?: string;
  events: RunEvent[];
  push: (e: RunEvent) => void;
  clear: () => void;
  setRun: (id?: string) => void;
};

export const useEventBus = create<Bus>((set) => {
  return {
    runId: undefined,
    events: [],
    push: (e) => set((s) => ({ events: [...s.events, e] })),
    clear: () => set({ events: [] }),
    setRun: (id) => set({ runId: id, events: [] }),
  };
});
