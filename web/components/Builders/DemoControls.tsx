"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, RefreshCcw, Sparkles, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useDemoStore } from "@/hooks/useDemoStore";
import { useActiveRun } from "@/hooks/useBuildersStore";

// Duration (ms) the re-seed confirm state stays visible before auto-dismissing
const CONFIRM_DISMISS_MS = 3_000;

export default function DemoControls() {
  const phase = useDemoStore((s) => s.phase);
  const notAvailable = useDemoStore((s) => s.notAvailable);
  const seedVersion = useDemoStore((s) => s.seedVersion);
  const seed = useDemoStore((s) => s.seed);

  // EC-2: disable re-seed when a run is active to avoid orphaning it
  const activeRun = useActiveRun();
  const runIsActive =
    activeRun?.status === "pending" || activeRun?.status === "running";

  // ── Re-seed inline confirmation state ─────────────────────────────────
  // First click → confirming=true. Second click within 3s → fires seed.
  const [confirming, setConfirming] = useState(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear confirmation timer on unmount — EC-8 pattern
  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    };
  }, []);

  // Reset confirming state whenever phase changes (seed started or errored)
  useEffect(() => {
    if (phase === "seeding" || phase === "error") {
      setConfirming(false);
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    }
  }, [phase]);

  // EC-3: backend not in dev mode — hide entirely
  if (notAvailable) return null;

  // ── Handlers ──────────────────────────────────────────────────────────

  function handleFirstSeed() {
    void seed({ force: false });
  }

  function handleReseedClick() {
    if (confirming) {
      // Second click within 3s — confirmed, fire re-seed
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      setConfirming(false);
      void seed({ force: true });
    } else {
      // First click — enter confirmation state
      setConfirming(true);
      confirmTimerRef.current = setTimeout(() => {
        setConfirming(false);
      }, CONFIRM_DISMISS_MS);
    }
  }

  function handleRetry() {
    void seed({ force: false });
  }

  // ── Render: Seeding spinner ────────────────────────────────────────────

  if (phase === "seeding") {
    return (
      <Button size="xs" variant="outline" disabled className="gap-1.5">
        <Loader2 className="h-3 w-3 animate-spin" />
        Seeding…
      </Button>
    );
  }

  // ── Render: Error — Retry button ──────────────────────────────────────

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

  // ── Render: Success OR returning user (seedVersion > 0) ───────────────
  // Show a ghost "Re-seed" with inline confirmation guard

  if (phase === "success" || (phase === "idle" && seedVersion > 0)) {
    return (
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
    );
  }

  // ── Render: Default — first-time Seed Demo button ─────────────────────
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

  // Defensive fallback — all phases are exhausted above.
  // Should never reach here in practice.
  return null;
}
