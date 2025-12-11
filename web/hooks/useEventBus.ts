"use client";

import type { RunEvent } from "@/services/job6";
import { create } from "zustand";

interface EventBusState {
  runId: string | null;
  events: RunEvent[];
  setRunId: (id: string | null) => void;
  pushEvent: (event: RunEvent) => void;
  clearEvents: () => void;
}

export const useEventBus = create<EventBusState>((set) => ({
  runId: null,
  events: [],

  //actions
  setRunId: (id) => {
    set({ runId: id, events: [] });
  },
  pushEvent: (event) => {
    // Ignore completely unknown shapes if needed to match spec
    if (!event || typeof event.type !== "string") return;
    set((state) => ({
      events: [...state.events, event],
    }));
  },

  clearEvents: () => {
    set({ events: [] });
  },
}));
