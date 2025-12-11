"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface BuildModalProps {
  open: boolean;
  title?: string;
  subtitle?: string;
  onCancel?: () => void;
}

/**
 * Simple BUILD modal skeleton used during Job 6 runs.
 * You can extend this later with real build logs or progress.
 */
export default function BuildModal({
  open,
  title = "Running agent",
  subtitle = "Executing run pipeline…",
  onCancel,
}: BuildModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl bg-[hsl(var(--panel))] border border-[hsl(var(--border))] p-4 shadow-lg">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <div className="flex flex-col">
            <span className="text-[14px] font-medium">{title}</span>
            <span className="text-[11px] text-[hsl(var(--muted-fg))]">
              {subtitle}
            </span>
          </div>
        </div>
        {onCancel && (
          <div className="mt-4 flex justify-end">
            <Button size="sm" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
