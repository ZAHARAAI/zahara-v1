"use client";

import { create } from "zustand";

type RunUIState = {
  open: boolean;
  title: string;
  subtitle?: string;
  setOpen: (open: boolean) => void;
  show: (title: string, subtitle?: string) => void;
  hide: () => void;
};

export const useRunUIStore = create<RunUIState>((set) => ({
  open: false,
  title: "BUILD",
  subtitle: undefined,
  setOpen: (open) => set({ open }),
  show: (title, subtitle) => set({ open: true, title, subtitle }),
  hide: () => set({ open: false, subtitle: undefined }),
}));
