"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCcw, Sparkles, AlertCircle, Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { useDemoStore } from "@/hooks/useDemoStore";
import { useActiveRun, useBuildersStore } from "@/hooks/useBuildersStore";
import { useRunStore } from "@/hooks/useRunStore";
import { listAgents } from "@/services/api";

// Duration (ms) the re-seed confirm state stays visible before auto-dismissing
const CONFIRM_DISMISS_MS = 3_000;

export default function DemoControls() {
  const router = useRouter();
  const phase = useDemoStore((s) => s.phase);
  const notAvailable = useDemoStore((s) => s.notAvailable);
  const seedVersion = useDemoStore((s) => s.seedVersion);
  const seed = useDemoStore((s) => s.seed);
  const result = useDemoStore((s) => s.result);

  const activeRun = useActiveRun();
  const runIsActive =
    activeRun?.status === "pending" || activeRun?.status === "running";

  const [isSampling, setIsSampling] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (phase === "seeding" || phase === "error") {
      setConfirming(false);
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    }
  }, [phase]);

  if (notAvailable) return null;

  function handleFirstSeed() {
    void seed({ force: false });
  }

  function handleReseedClick() {
    if (confirming) {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      setConfirming(false);
      void seed({ force: true });
    } else {
      setConfirming(true);
      confirmTimerRef.current = setTimeout(() => {
        setConfirming(false);
      }, CONFIRM_DISMISS_MS);
    }
  }

  function handleRetry() {
    void seed({ force: false });
  }

  async function handleRunSample() {
    setIsSampling(true);
    try {
      // ── Agent resolution ───────────────────────────────────────────────
      // PRIMARY: use agent_ids from seed result if present.
      // FALLBACK: the Job 8 backend no longer returns agent_ids in the seed
      // response. When it's absent or empty, call listAgents() and pick the
      // first demo agent (slug starts with "demo-"), or the first agent at all.
      let agentId: string | null = result?.agent_ids?.[0] ?? null;

      if (!agentId) {
        try {
          const agents = await listAgents();
          const demoAgent = agents.find((a) => a.slug?.startsWith("demo-"));
          agentId = demoAgent?.id ?? agents[0]?.id ?? null;
        } catch {
          agentId = null;
        }
      }

      if (!agentId) {
        toast.error("No demo agent found — seed demo data first.");
        return;
      }

      // Sync agent context so Vibe mode picks it up
      useBuildersStore.getState().setSelectedAgentId(agentId);

      // Start the run
      await useRunStore
        .getState()
        .startRun(agentId, "What can you help me with?");

      const runId = useRunStore.getState().activeRun?.runId ?? null;

      toast.success("Sample run started!", {
        duration: 8000,
        action: runId
          ? {
              label: "View in Clinic →",
              onClick: () =>
                router.push(`/clinic?runId=${encodeURIComponent(runId)}`),
            }
          : undefined,
      });
    } catch (err) {
      toast.error((err as Error).message ?? "Failed to start sample run");
    } finally {
      setIsSampling(false);
    }
  }

  // ── Seeding spinner ────────────────────────────────────────────────────
  if (phase === "seeding") {
    return (
      <Button size="xs" variant="outline" disabled className="gap-1.5">
        <Loader2 className="h-3 w-3 animate-spin" />
        Seeding…
      </Button>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────
  if (phase === "error") {
    return (
      <Button
        size="xs"
        variant="outline"
        onClick={handleRetry}
        className="gap-1.5 border-red-500/40 text-red-400 hover:bg-red-500/10"
      >
        <AlertCircle className="h-3 w-3" />
        Retry seed
      </Button>
    );
  }

  // ── Seeded — Run Sample + Re-seed ──────────────────────────────────────
  if (phase === "success" || (phase === "idle" && seedVersion > 0)) {
    return (
      <div className="flex items-center gap-2">
        <Button
          size="xs"
          variant="outline"
          onClick={() => void handleRunSample()}
          disabled={runIsActive || isSampling}
          title={
            runIsActive
              ? "Cannot run while another run is active"
              : "Run a sample prompt on the first demo agent"
          }
          className="gap-1.5"
        >
          {isSampling ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Play className="h-3 w-3" />
          )}
          {isSampling ? "Starting…" : "Run Sample"}
        </Button>

        <Button
          size="xs"
          variant={confirming ? "outline" : "ghost"}
          onClick={handleReseedClick}
          disabled={runIsActive}
          title={
            runIsActive
              ? "Cannot re-seed while a run is active"
              : confirming
                ? "Click again to confirm — this overwrites existing demo data"
                : "Re-seed demo data"
          }
          className={[
            "gap-1.5 transition-colors",
            confirming
              ? "border-amber-500/40 text-amber-500 hover:bg-amber-500/10"
              : "text-muted_fg hover:text-fg",
          ].join(" ")}
        >
          <RefreshCcw className="h-3 w-3" />
          {confirming ? "Confirm re-seed?" : "Re-seed"}
        </Button>
      </div>
    );
  }

  // ── First-time seed CTA ────────────────────────────────────────────────
  if (phase === "idle" && seedVersion === 0) {
    return (
      <Button
        size="xs"
        variant="primary"
        onClick={handleFirstSeed}
        className="gap-1.5"
      >
        <Sparkles className="h-3 w-3" />
        Seed Demo
      </Button>
    );
  }

  return null;
}
