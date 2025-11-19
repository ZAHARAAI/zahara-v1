"use client";

import Panel from "@/components/MCP/Panel";
export default function MCPPage() {
  return (
    <div className="h-[calc(100vh-2rem)] border border-[hsl(var(--border))] rounded-2xl overflow-hidden">
      <Panel />
    </div>
  );
}
