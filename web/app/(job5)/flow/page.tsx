"use client";
import Inspector from "@/components/Flow/Inspector";
import Toolbar from "@/components/Flow/Toolbar";
import dynamic from "next/dynamic";

const Canvas = dynamic(() => import("@/components/Flow/Canvas"), {
  ssr: false,
});

export default function FlowPage() {
  return (
    <div className="grid grid-rows-[auto_1fr] gap-3 h-[calc(100vh-2rem)]">
      <Toolbar />
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-8 border border-[hsl(var(--border))] rounded-2xl overflow-hidden">
          <Canvas />
        </div>
        <div className="col-span-4 border border-[hsl(var(--border))] rounded-2xl overflow-hidden">
          <Inspector />
        </div>
      </div>
    </div>
  );
}
