"use client";

import Canvas from "@/components/Flow/Canvas";
import Inspector from "@/components/Flow/Inspector";
import Toolbar from "@/components/Flow/Toolbar";
import { Suspense, useState } from "react";
import { Button } from "@/components/ui/Button";

export default function FlowPage() {
  const [showInspector, setShowInspector] = useState(true);

  return (
    <div className="h-[calc(100vh-3rem)]">
      <Suspense fallback={<div className="p-4 text-sm">Loading flow…</div>}>
        <Toolbar />
      </Suspense>

      <div className="mt-2 flex items-center justify-end gap-2 text-[11px] text-[hsl(var(--muted-fg))]">
        <span>Inspector panel</span>
        <Button
          size="xs"
          variant="outline"
          onClick={() => setShowInspector((v) => !v)}
        >
          {showInspector ? "Hide" : "Show"}
        </Button>
      </div>

      <div className="mt-3 flex gap-3 h-[calc(100%-4rem)]">
        <div
          className={[
            "border border-[hsl(var(--border))] rounded-2xl overflow-hidden transition-[flex-basis] duration-150",
            showInspector ? "flex-1" : "flex-[0_0_100%]",
          ].join(" ")}
        >
          <Canvas />
        </div>
        {showInspector && (
          <div className="border w-80 border-[hsl(var(--border))] rounded-2xl overflow-hidden">
            <Inspector />
          </div>
        )}
      </div>
    </div>
  );
}
