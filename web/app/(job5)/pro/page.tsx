"use client";
import dynamic from "next/dynamic";
import Toolbar from "@/components/Pro/Toolbar";
import FileTree from "@/components/Pro/FileTree";
import LogPanel from "@/components/Pro/LogPanel";
const Editor = dynamic(() => import("@/components/Pro/Editor"), { ssr: false });

export default function ProPage() {
  return (
    <div className="grid grid-rows-[auto_1fr_minmax(160px,280px)] gap-3 h-[calc(100vh-2rem)]">
      <Toolbar />
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-3 border border-[hsl(var(--border))] rounded-2xl overflow-hidden">
          <FileTree />
        </div>
        <div className="col-span-9 border border-[hsl(var(--border))] rounded-2xl overflow-hidden">
          <Editor />
        </div>
      </div>
      <div className="border border-[hsl(var(--border))] rounded-2xl overflow-hidden">
        <LogPanel />
      </div>
    </div>
  );
}
