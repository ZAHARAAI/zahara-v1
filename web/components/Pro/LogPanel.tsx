"use client";

import { useEventBus } from "@/hooks/useEventBus";

export default function LogPanel() {
  const { events } = useEventBus();

  return (
    <div className="h-full overflow-auto bg-[hsl(var(--panel))] p-3 text-xs font-mono">
      {events.length === 0 && (
        <div className="opacity-60">Logs will appear here…</div>
      )}
      {events.map((e, i) => (
        <div
          key={i}
          className="mb-2 border-b border-[hsl(var(--border))] pb-1 last:border-0"
        >
          <pre className="whitespace-pre-wrap">
            {JSON.stringify(e, null, 2)}
          </pre>
        </div>
      ))}
    </div>
  );
}
