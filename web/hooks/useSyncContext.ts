"use client";
import { useRouter } from "next/navigation";
import { useBuildersStore } from "@/hooks/useBuildersStore";

// Call from any mode component when the user selects an agent.
// Updates both the Zustand store and the URL atomically.
export function useSyncAgentToUrl() {
  const router = useRouter();
  const setSelectedAgentId = useBuildersStore((s) => s.setSelectedAgentId);

  return (agentId: string) => {
    setSelectedAgentId(agentId);

    // Read current store state (not stale closure) to preserve other params
    const { mode, selectedRunId } = useBuildersStore.getState();
    const params = new URLSearchParams();
    params.set("v", mode);
    params.set("agentId", agentId);
    if (selectedRunId) params.set("runId", selectedRunId);

    router.replace(`/builders?${params.toString()}`);
  };
}
