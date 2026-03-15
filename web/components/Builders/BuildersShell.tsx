"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useBuildersStore, type BuilderMode } from "@/hooks/useBuildersStore";
import { useDemoStore } from "@/hooks/useDemoStore";

import dynamic from "next/dynamic";
import ModeNav from "./ModeNav";
import { ModeErrorBoundary } from "./ModeErrorBoundary";
import DemoStatusPill from "./DemoStatusPill";
import DemoControls from "./DemoControls";

// Clean, unambiguous imports — no parentheses in path
const VibePage = dynamic(() => import("@/components/Vibe/VibePage"), {
  ssr: false,
  loading: () => <ModeSkeleton />,
});
const FlowPage = dynamic(() => import("@/components/Flow/Flow"), {
  ssr: false,
  loading: () => <ModeSkeleton />,
});
const ProPage = dynamic(() => import("@/components/Pro/ProPage"), {
  ssr: false,
  loading: () => <ModeSkeleton />,
});

// ── Animation variants ────────────────────────────────────────────────────
const modeVariants = {
  enter: {
    opacity: 0,
    y: 6,
    // No filter — too expensive, visible jank on integrated graphics
  },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.2, ease: "easeOut" },
  },
  exit: {
    opacity: 0,
    y: -4,
    transition: { duration: 0.14, ease: "easeIn" },
  },
};

// ── Valid modes — used to sanitize URL param ──────────────────────────────
const VALID_MODES: BuilderMode[] = ["vibe", "flow", "pro"];

function isValidMode(v: string | null): v is BuilderMode {
  return VALID_MODES.includes(v as BuilderMode);
}

export default function BuildersShell() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const {
    mode,
    setMode,
    setSelectedAgentId,
    setSelectedRunId,
    _hydrated,
    _setHydrated,
  } = useBuildersStore();

  // ── Demo store rehydration ────────────────────────────────────────────
  useEffect(() => {
    useDemoStore.persist.rehydrate();
  }, []);

  // ── Hydrate store from URL on first mount ─────────────────────────────
  // useRef prevents double-hydration in React StrictMode
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;

    const v = searchParams.get("v");
    const agentId = searchParams.get("agentId");
    const runId = searchParams.get("runId");

    // Sanitize mode param — default to vibe if missing or invalid
    const resolvedMode: BuilderMode = isValidMode(v) ? v : "vibe";
    setMode(resolvedMode);

    if (agentId) setSelectedAgentId(agentId);
    if (runId) setSelectedRunId(runId);

    // If URL had no valid ?v= param, normalize it without adding to history
    if (!isValidMode(v)) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("v", "vibe");
      router.replace(`/builders?${params.toString()}`);
    }

    _setHydrated();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only on mount — searchParams intentionally excluded

  // ── Mode switch handler ───────────────────────────────────────────────
  // Writes to URL first, then updates store.
  // router.replace keeps a single history entry for /builders.
  const switchMode = (newMode: BuilderMode) => {
    if (newMode === mode) return;

    const { selectedAgentId, selectedRunId } = useBuildersStore.getState();
    const params = new URLSearchParams();
    params.set("v", newMode);
    if (selectedAgentId) params.set("agentId", selectedAgentId);
    if (selectedRunId) params.set("runId", selectedRunId);

    // URL first — store second. Never the other way.
    router.replace(`/builders?${params.toString()}`);

    // React.startTransition marks this as non-urgent — it won't interrupt
    // the current render frame, preventing the mode flash.
    startTransition(() => {
      setMode(newMode);
    });
  };

  // ── Don't render mode content until URL has been read ─────────────────
  // Prevents one-frame flash of wrong mode
  if (!_hydrated) return <ModeSkeleton />;

  return (
    <div className="flex flex-col h-full">
      {/* ── Demo controls header ── */}
      <BuildersHeader />

      {/* ── Centered mode nav ── */}
      <ModeNav activeMode={mode} onSwitch={switchMode} />

      {/* ── Animated content area ── */}
      <div className="flex-1 overflow-hidden relative">
        <ModeErrorBoundary mode={mode}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={mode}
              // variants={modeVariants}
              initial={{
                opacity: 0,
                y: 6,
              }}
              animate={{
                opacity: 1,
                y: 0,
                transition: { duration: 0.2, ease: "easeOut" },
              }}
              exit={{
                opacity: 0,
                y: -4,
                transition: { duration: 0.14, ease: "easeIn" },
              }}
              // Important: absolute positioning allows exit animation to
              // overlay the entering mode without layout shift
              className="absolute inset-0 overflow-auto"
            >
              {mode === "vibe" && <VibePage />}
              {mode === "flow" && <FlowPage />}
              {mode === "pro" && <ProPage />}
            </motion.div>
          </AnimatePresence>
        </ModeErrorBoundary>
      </div>
    </div>
  );
}

// ── Header — DemoStatusPill left, DemoControls right ─────────────────────
function BuildersHeader() {
  return (
    <div className="h-12 border-b border-border bg-panel flex items-center px-4 gap-3 shrink-0">
      {/* Left: status pill reflects seed phase */}
      <DemoStatusPill />

      {/* Right: seed / re-seed controls */}
      <div className="ml-auto">
        <DemoControls />
      </div>
    </div>
  );
}

// ── Skeleton shown during dynamic import loading ──────────────────────────
function ModeSkeleton() {
  return (
    <div className="flex-1 flex items-center justify-center h-full">
      <div className="flex flex-col items-center gap-3 animate-pulse">
        <div className="h-8 w-8 rounded-full bg-muted" />
        <div className="h-3 w-24 rounded bg-muted" />
      </div>
    </div>
  );
}
