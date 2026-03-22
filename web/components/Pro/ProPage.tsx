"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

import Toolbar from "@/components/Pro/Toolbar";
import Editor from "@/components/Pro/Editor";
import FileTree from "@/components/Pro/FileTree";
import LogPanel from "@/components/Pro/LogPanel";
import { useProStore } from "@/hooks/useProStore";
import { useBuildersStore } from "@/hooks/useBuildersStore";

export default function ProPage() {
  const searchParams = useSearchParams();
  const { agentId, setAgentId } = useProStore();

  // Priority 1: agentId from URL param (?agentId=xxx) — set by Flow "Open in Pro"
  useEffect(() => {
    const fromQuery = searchParams.get("agentId");
    if (fromQuery && fromQuery !== agentId) {
      setAgentId?.(fromQuery);
    }
  }, [searchParams, agentId, setAgentId]);

  // Priority 2: if no URL param, bridge from BuildersStore (the agent the
  // user already selected in Vibe or Flow). This means switching to Pro
  // after selecting an agent in another mode "just works" for the guest.
  useEffect(() => {
    const fromQuery = searchParams.get("agentId");
    if (fromQuery) return; // URL param wins — don't override

    const selectedFromStore = useBuildersStore.getState().selectedAgentId;
    if (selectedFromStore && selectedFromStore !== agentId) {
      setAgentId?.(selectedFromStore);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only on first mount — URL-param effect handles subsequent changes

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col gap-3">
      <Toolbar />
      <div className="flex flex-1 gap-3 overflow-hidden">
        <div className="w-64 border border-border rounded-2xl overflow-hidden">
          <FileTree />
        </div>
        <div className="flex-1 border border-border rounded-2xl overflow-hidden">
          <Editor />
        </div>
        <div className="w-80 border border-border rounded-2xl overflow-hidden">
          <LogPanel />
        </div>
      </div>
    </div>
  );
}
