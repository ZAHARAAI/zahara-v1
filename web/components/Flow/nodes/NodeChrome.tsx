"use client";

import React from "react";
import { Handle, Position } from "reactflow";

export function NodeChrome({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--panel))] shadow-sm min-w-[180px]">
      <div className="px-3 py-2 text-xs uppercase tracking-wide border-b border-[hsl(var(--border))]">
        {title}
      </div>
      <div className="p-3 text-xs space-y-1">{children}</div>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
