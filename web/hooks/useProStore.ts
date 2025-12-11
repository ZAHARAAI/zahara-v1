/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import {
  IdeFile,
  IdeFileEntry,
  listFiles,
  readFile,
  saveFile,
  SaveFileResponse,
} from "@/services/api";
import { create } from "zustand";

interface ProState {
  files: IdeFileEntry[];
  selectedPath: string | null;
  content: string;
  sha: string | null;
  loadingFiles: boolean;
  loadingFile: boolean;
  saving: boolean;
  dirty: boolean;
  error: string | null;
  agentId?: string | null;

  // actions
  loadFiles: () => Promise<void>;
  openFile: (path: string) => Promise<void>;
  setContent: (value: string) => void;
  saveCurrentFile: () => Promise<void>;
  clearError: () => void;
  setAgentId?: (id: string | null) => void;
}

export const useProStore = create<ProState>((set, get) => ({
  files: [],
  selectedPath: null,
  content: "",
  sha: null,
  loadingFiles: false,
  loadingFile: false,
  saving: false,
  dirty: false,
  error: null,
  agentId: null,

  //actions
  loadFiles: async () => {
    set({ loadingFiles: true, error: null });
    try {
      const files = await listFiles();
      set({ files });
    } catch (err: any) {
      console.error("Failed to load files", err);
      set({ error: err?.message ?? "Failed to load files" });
    } finally {
      set({ loadingFiles: false });
    }
  },

  openFile: async (path: string) => {
    if (!path) return;
    set({ loadingFile: true, error: null });
    try {
      const file: IdeFile = await readFile(path);
      set({
        selectedPath: file.path,
        content: file.content,
        sha: file.sha,
        dirty: false,
      });
    } catch (err: any) {
      console.error("Failed to open file", err);
      set({ error: err?.message ?? "Failed to open file" });
    } finally {
      set({ loadingFile: false });
    }
  },

  setContent: (value: string) => {
    const { content } = get();
    set({
      content: value,
      dirty: value !== content,
    });
  },

  saveCurrentFile: async () => {
    const { selectedPath, content, sha } = get();
    if (!selectedPath) {
      set({ error: "No file selected to save" });
      return;
    }

    set({ saving: true, error: null });
    try {
      const json: SaveFileResponse = await saveFile(
        selectedPath,
        content,
        sha ?? undefined
      );
      set({ sha: json.sha, dirty: false });
    } catch (err: any) {
      console.error("Failed to save file", err);
      set({ error: err?.message ?? "Failed to save file" });
    } finally {
      set({ saving: false });
    }
  },

  clearError: () => set({ error: null }),
  setAgentId: (id) => set({ agentId: id }),
}));
