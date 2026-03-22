"use client";

import { useEffect, useRef } from "react";
import RunConsole from "@/components/Vibe/RunConsole";
import RunHistory from "@/components/Vibe/RunHistory";
import PromptInput from "@/components/Vibe/PromptInput";
import { useRunStore, useRunStatus } from "@/hooks/useRunStore";
import { Activity } from "lucide-react";

interface VibeChatProps {
  agentId: string | null;
  agentName?: string;
  agentStatus?: string | null;
}

export default function VibeChat({
  agentId,
  agentName,
  agentStatus,
}: VibeChatProps) {
  const resetForAgent = useRunStore((s) => s.resetForAgent);
  const prevAgentRef = useRef<string | null>(null);
  const runStatus = useRunStatus();

  useEffect(() => {
    if (agentId && agentId !== prevAgentRef.current) {
      prevAgentRef.current = agentId;
      resetForAgent(agentId);
    }
    if (!agentId) prevAgentRef.current = null;
  }, [agentId, resetForAgent]);

  return (
    <div className="flex h-full overflow-hidden bg-bg">
      {/* ── History sidebar ── */}
      <aside className="w-56 shrink-0 border-r border-border flex flex-col">
        <RunHistory agentId={agentId} />
      </aside>

      {/* ── Main panel: header + console + input ── */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Top chrome bar */}
        <header className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-panel shrink-0">
          {/* Status dot */}
          <span
            className={[
              "relative flex h-2 w-2 shrink-0",
              runStatus === "running" ? "visible" : "invisible",
            ].join(" ")}
          >
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-60" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-accent" />
          </span>

          <div className="flex items-center gap-2 min-w-0">
            <Activity className="h-3.5 w-3.5 text-muted_fg shrink-0" />
            {agentId ? (
              <span className="font-mono text-[11px] text-fg/70 truncate">
                <span className="text-muted_fg">agent /</span>{" "}
                <span className="text-fg font-medium">
                  {agentName ?? agentId}
                </span>
              </span>
            ) : (
              <span className="font-mono text-[11px] text-muted_fg/50">
                — select an agent to begin —
              </span>
            )}
          </div>

          {/* Status badge */}
          {agentId && (
            <span className="ml-auto shrink-0">
              <RunStatusBadge status={runStatus} />
            </span>
          )}
        </header>

        {/* Console — fills remaining height */}
        <RunConsole agentId={agentId} className="flex-1 min-h-0" />

        {/* Input — pinned at bottom */}
        <PromptInput agentId={agentId} agentStatus={agentStatus} />
      </div>
    </div>
  );
}

// ── Inline status badge ───────────────────────────────────────────────────────

function RunStatusBadge({ status }: { status: string }) {
  if (status === "running") {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium
        bg-accent/10 text-accent border border-accent/25 dark:bg-accent/15 dark:border-accent/30"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
        running
      </span>
    );
  }
  if (status === "done") {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono
        bg-accent/8 text-accent/80 border border-accent/20 dark:bg-accent/10"
      >
        ✓ done
      </span>
    );
  }
  if (status === "error") {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono
        bg-red-500/8 text-red-600 dark:text-red-400 border border-red-500/20"
      >
        ✕ error
      </span>
    );
  }
  if (status === "cancelled") {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono
        bg-muted text-muted_fg border border-border"
      >
        ○ cancelled
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono
      bg-muted text-muted_fg border border-border"
    >
      idle
    </span>
  );
}
