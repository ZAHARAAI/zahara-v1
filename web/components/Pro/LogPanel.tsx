"use client";
import { useEventBus } from "@/hooks/useEventBus";

export default function LogPanel() {
  const { events } = useEventBus();
  return (
    <div className="h-full overflow-auto p-3 text-xs font-mono space-y-1">
      {events.length === 0 && (
        <div className="opacity-60">Logs will appear here…</div>
      )}
      {events.map((e, i) => (
        <div key={i} className="border-b border-[hsl(var(--border))] pb-1">
          <pre className="whitespace-pre-wrap">
            {JSON.stringify(e, null, 2)}
          </pre>
        </div>
      ))}
    </div>
  );
}
