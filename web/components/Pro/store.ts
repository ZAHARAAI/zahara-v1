"use client";
import { create } from "zustand";

type State = {
  activePath?: string;
  content: string;
  sha?: string;
  dirty: boolean;
  setActiveFile: (p: string, content: string, sha: string) => void;
  setContent: (c: string) => void;
  markSaved: (sha: string) => void;
};

export const useProStore = create<State>((set) => ({
  activePath: undefined,
  content: "",
  sha: undefined,
  dirty: false,
  setActiveFile: (activePath, content, sha) =>
    set({ activePath, content, sha, dirty: false }),
  setContent: (content) => set({ content, dirty: true }),
  markSaved: (sha) => set({ sha, dirty: false }),
}));
