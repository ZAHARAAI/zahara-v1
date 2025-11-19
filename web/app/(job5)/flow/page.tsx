"use client";

import Canvas from "@/components/Flow/Canvas";
import Inspector from "@/components/Flow/Inspector";
import Toolbar from "@/components/Flow/Toolbar";
import { Suspense } from "react";

export default function FlowPage() {
  return (
    <div className="h-[calc(100vh-2rem)]">
      <Suspense fallback={<div className="p-4 text-sm">Loading flow…</div>}>
        <Toolbar />
      </Suspense>

      <div className="mt-3 flex gap-3 h-[calc(100%-4rem)]">
        <div className="flex-1 border border-[hsl(var(--border))] rounded-2xl overflow-hidden">
          <Canvas />
        </div>
        <div className="border w-80 border-[hsl(var(--border))] rounded-2xl overflow-hidden">
          <Inspector />
        </div>
      </div>
    </div>
  );
}
