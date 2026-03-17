// web/app/(app)/(private-routes)/builders/layout.tsx
import { Suspense } from "react";

export default function BuildersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="-m-4 h-[calc(100%+2rem)]">
      <Suspense fallback={<BuildersSkeleton />}>{children}</Suspense>
    </div>
  );
}

function BuildersSkeleton() {
  return (
    <div className="flex flex-col h-full animate-pulse">
      <div className="h-12 border-b border-border bg-panel flex items-center px-4 gap-3">
        <div className="h-5 w-20 rounded-full bg-muted" />
        <div className="h-7 w-24 rounded-lg bg-muted" />
      </div>
      <div className="h-14 border-b border-border flex items-center justify-center gap-6">
        {["Vibe", "Flow", "Pro"].map((m) => (
          <div key={m} className="h-6 w-14 rounded bg-muted" />
        ))}
      </div>
      <div className="flex-1 bg-bg" />
    </div>
  );
}
