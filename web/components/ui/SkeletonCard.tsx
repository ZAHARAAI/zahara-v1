// ── Primitive: a single animated placeholder bar ──────────────────────────

interface SkeletonBarProps {
  /** Tailwind width class, e.g. "w-24", "w-3/4", "w-full" */
  width?: string;
  /** Tailwind height class, e.g. "h-3", "h-4" */
  height?: string;
  className?: string;
}

export function SkeletonBar({
  width = "w-24",
  height = "h-3",
  className = "",
}: SkeletonBarProps) {
  return (
    <div
      className={[
        "rounded-full bg-muted animate-pulse",
        width,
        height,
        className,
      ].join(" ")}
    />
  );
}

// ── Primitive: a rectangular block (for cards, avatars, images) ───────────

interface SkeletonBlockProps {
  className?: string;
}

export function SkeletonBlock({ className = "" }: SkeletonBlockProps) {
  return (
    <div
      className={["rounded-xl bg-muted animate-pulse", className].join(" ")}
    />
  );
}

// ── Composite: one skeleton row matching the AgentList item layout ─────────

export function AgentRowSkeleton() {
  return (
    <li className="flex flex-col gap-2 px-3 py-2 border-b border-border last:border-0">
      {/* Name + badge row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <SkeletonBar width="w-24" height="h-3" />
          <SkeletonBar width="w-10" height="h-4" className="rounded-full" />
        </div>
        {/* Kill / delete buttons placeholder */}
        <div className="flex flex-col items-end gap-2">
          <SkeletonBlock className="h-5 w-5" />
        </div>
      </div>

      {/* Slug / description line */}
      <SkeletonBar width="w-32" height="h-2" />

      {/* Stats micro-row */}
      <div className="flex items-center gap-2">
        <SkeletonBar width="w-14" height="h-2" />
        <SkeletonBar width="w-8" height="h-2" />
        <SkeletonBar width="w-12" height="h-2" />
      </div>

      {/* Budget card */}
      <div className="rounded-xl border border-border bg-panel px-2 py-2 space-y-2">
        <div className="flex items-center justify-between">
          <SkeletonBar width="w-16" height="h-2" />
          <SkeletonBar width="w-10" height="h-2" />
        </div>
        <SkeletonBlock className="h-2 w-full rounded-full" />
      </div>
    </li>
  );
}

// ── Composite: full agent list skeleton (N rows) ──────────────────────────

interface AgentListSkeletonProps {
  rows?: number;
}

export function AgentListSkeleton({ rows = 3 }: AgentListSkeletonProps) {
  return (
    <ul>
      {Array.from({ length: rows }, (_, i) => (
        <AgentRowSkeleton key={`skeleton-row-${i}`} />
      ))}
    </ul>
  );
}

// ── Composite: run list item skeleton ────────────────────────────────────

export function RunRowSkeleton() {
  return (
    <li className="flex flex-col gap-1.5 px-3 py-2.5 border-b border-border last:border-0">
      <div className="flex items-center justify-between gap-2">
        <SkeletonBar width="w-28" height="h-3" className="rounded" />
        <SkeletonBar width="w-14" height="h-4" className="rounded-full" />
      </div>
      <div className="flex items-center justify-between gap-2">
        <SkeletonBar width="w-20" height="h-2" />
        <SkeletonBar width="w-14" height="h-2" />
      </div>
      <SkeletonBar width="w-3/4" height="h-2" />
    </li>
  );
}

export function RunListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <ul>
      {Array.from({ length: rows }, (_, i) => (
        <RunRowSkeleton key={`run-skeleton-${i}`} />
      ))}
    </ul>
  );
}

// ── Generic re-export alias ───────────────────────────────────────────────
export const SkeletonCard = SkeletonBlock;
