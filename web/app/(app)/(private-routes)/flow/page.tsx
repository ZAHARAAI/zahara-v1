"use client";

import Canvas from "@/components/Flow/Canvas";
import Inspector from "@/components/Flow/Inspector";
import Toolbar from "@/components/Flow/Toolbar";
import LeftPanel from "@/components/Flow/LeftPanel";
import { Suspense, useState } from "react";
import { Button } from "@/components/ui/Button";

export default function FlowPage() {
  const [showInspector, setShowInspector] = useState(true);
  const [leftCollapsed, setLeftCollapsed] = useState(false);

  return (
    <div className="h-[calc(100vh-3rem)]">
      <Suspense fallback={<div className="p-4 text-sm">Loading flow…</div>}>
        <Toolbar />
      </Suspense>

      <div className="mt-3 flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={() => setShowInspector((v) => !v)}>
          {showInspector ? "Hide Inspector" : "Show Inspector"}
        </Button>
      </div>

      <div className="mt-3 flex gap-3 h-[calc(100%-4rem)]">
        <LeftPanel collapsed={leftCollapsed} onToggle={() => setLeftCollapsed((v) => !v)} />

        <div className="flex-1 border border-[hsl(var(--border))] rounded-2xl overflow-hidden">
          <Canvas />
        </div>

        {showInspector && (
          <div className="w-[420px] border border-[hsl(var(--border))] rounded-2xl overflow-hidden">
            <Inspector />
          </div>
        )}
      </div>
    </div>
  );
}
