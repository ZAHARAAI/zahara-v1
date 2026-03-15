"use client";

import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useDemoStore } from "@/hooks/useDemoStore";

// Auto-hide duration for the "Demo ready" success state
const SUCCESS_HIDE_MS = 8_000;

const DOT_COLORS = {
  amber: "bg-amber-400",
  green: "bg-emerald-400",
  red: "bg-red-400",
} as const;

const PILL_COLORS = {
  amber:
    "bg-amber-500/10 border-amber-500/25 text-amber-600 dark:text-amber-300",
  green:
    "bg-emerald-500/10 border-emerald-500/25 text-emerald-600 dark:text-emerald-300",
  red: "bg-red-500/10 border-red-500/25 text-red-600 dark:text-red-300",
} as const;

export default function DemoStatusPill() {
  const { phase, errorMessage, succeededAt } = useDemoStore(
    useShallow((s) => ({
      phase: s.phase,
      errorMessage: s.errorMessage,
      succeededAt: s.succeededAt,
    })),
  );

  const [successVisible, setSuccessVisible] = useState(false);

  useEffect(() => {
    if (phase !== "success" || succeededAt === null) {
      setSuccessVisible(false);
      return;
    }
    const age = Date.now() - succeededAt;

    if (age >= SUCCESS_HIDE_MS) {
      setSuccessVisible(false);
      return;
    }

    setSuccessVisible(true);
    const remaining = SUCCESS_HIDE_MS - age;
    const timer = setTimeout(() => setSuccessVisible(false), remaining);

    // EC-8: clean up timer on unmount or before next effect run
    return () => clearTimeout(timer);
  }, [phase, succeededAt]); // re-runs when a new seed completes (succeededAt changes)

  // ── Render ────────────────────────────────────────────────────────────

  // Never seeded — show amber "Not seeded" pill to prompt action
  if (phase === "idle") {
    return <Pill color="amber" pulse={false} label="Not seeded" />;
  }

  if (phase === "seeding") {
    return <Pill color="amber" pulse={true} label="Seeding demo…" />;
  }

  if (phase === "success") {
    // Don't show the pill if the 8s window has elapsed (returning user)
    if (!successVisible) return null;
    return <Pill color="green" pulse={false} label="Demo ready" />;
  }

  if (phase === "error") {
    return (
      <Pill
        color="red"
        pulse={false}
        label="Seed failed"
        tooltip={errorMessage ?? undefined}
      />
    );
  }

  return null;
}

// ── Pill primitive ────────────────────────────────────────────────────────

interface PillProps {
  color: keyof typeof DOT_COLORS;
  pulse: boolean;
  label: string;
  tooltip?: string;
}

function Pill({ color, pulse, label, tooltip }: PillProps) {
  return (
    <span
      title={tooltip}
      className={[
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1",
        "text-[11px] font-medium leading-none select-none",
        PILL_COLORS[color],
      ].join(" ")}
    >
      <span
        className={[
          "h-1.5 w-1.5 rounded-full shrink-0",
          DOT_COLORS[color],
          pulse ? "animate-pulse" : "",
        ].join(" ")}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}
