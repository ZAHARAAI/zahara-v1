"use client";

import { type BuilderMode } from "@/hooks/useBuildersStore";

interface ModeNavProps {
  activeMode: BuilderMode;
  onSwitch: (mode: BuilderMode) => void;
}

const MODES: { id: BuilderMode; label: string; sub: string }[] = [
  { id: "vibe", label: "Vibe", sub: "Fastest" },
  { id: "flow", label: "Flow", sub: "Structured" },
  { id: "pro", label: "Pro", sub: "Full control" },
];

export default function ModeNav({ activeMode, onSwitch }: ModeNavProps) {
  return (
    <nav
      className="shrink-0 h-14 border-b border-border bg-panel flex items-center justify-center gap-1 px-4"
      aria-label="Builder mode"
    >
      {MODES.map(({ id, label, sub }) => {
        const isActive = activeMode === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSwitch(id)}
            aria-current={isActive ? "page" : undefined}
            className={[
              "relative flex flex-col items-center px-5 py-2 rounded-lg",
              "text-sm font-medium transition-colors duration-150",
              "hover:bg-muted focus-visible:outline-none focus-visible:ring-2",
              "focus-visible:ring-ring",
              isActive ? "text-fg bg-muted" : "text-muted_fg hover:text-fg",
            ].join(" ")}
          >
            <span>{label}</span>
            <span className="text-[10px] font-normal text-muted_fg mt-0.5">
              {sub}
            </span>

            {/* Active indicator — bottom border */}
            {isActive && (
              <span
                className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-accent"
                aria-hidden="true"
              />
            )}
          </button>
        );
      })}
    </nav>
  );
}
