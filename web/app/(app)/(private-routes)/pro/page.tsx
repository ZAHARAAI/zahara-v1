"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

import Toolbar from "@/components/Pro/Toolbar";
import Editor from "@/components/Pro/Editor";
import FileTree from "@/components/Pro/FileTree";
import LogPanel from "@/components/Pro/LogPanel";
import { useProStore } from "@/hooks/useProStore";

export default function ProPage() {
  const searchParams = useSearchParams();
  const { agentId, setAgentId } = useProStore();

  useEffect(() => {
    const fromQuery = searchParams.get("agentId");
    if (fromQuery && fromQuery !== agentId) {
      setAgentId?.(fromQuery);
    }
  }, [searchParams, agentId, setAgentId]);

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
