/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { AlertTriangle, Clipboard, Home, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Props = { error: Error & { digest?: string }; reset: () => void };

export default function Error({ error, reset }: Props) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Log for observability platforms
    console.error(error);
  }, [error]);

  const details = useMemo(() => {
    const payload = {
      message: error?.message ?? "Unknown error",
      name: error?.name,
      digest: (error as any)?.digest,
      stack: error?.stack,
      ts: new Date().toISOString(),
      userAgent:
        typeof navigator !== "undefined" ? navigator.userAgent : undefined,
    };
    return JSON.stringify(payload, null, 2);
  }, [error]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(details);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // no-op
    }
  };

  return (
    <div className="min-h-[60vh] grid place-items-center bg-[hsl(var(--bg))] px-4">
      <div className="w-full max-w-2xl rounded-2xl border border-[hsl(var(--border))] bg-white/60 p-6 shadow-xl backdrop-blur-md dark:bg-black/40">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-red-500/10 p-3 text-red-500">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-semibold leading-tight">
              Something went wrong
            </h1>
            <p className="mt-1 text-sm text-black/60 dark:text-white/60">
              We hit a snag while rendering this page. You can try again, head
              back home, or copy error details to share with support.
            </p>
          </div>
        </div>

        {/* Quick message */}
        {error?.message && (
          <div className="mt-4 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-3">
            <p className="text-sm font-medium">Message</p>
            <p className="mt-1 truncate text-sm opacity-80">{error.message}</p>
          </div>
        )}

        {/* Actions */}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button
            onClick={() => reset()}
            className="inline-flex items-center gap-2 rounded-xl bg-[hsl(var(--accent))] px-3 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            <RefreshCw className="h-4 w-4" />
            Try again
          </button>

          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl bg-[hsl(var(--muted))] px-3 py-2 text-sm font-medium hover:opacity-90"
          >
            <Home className="h-4 w-4" />
            Go home
          </Link>

          <button
            onClick={copy}
            className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium hover:bg-[hsl(var(--muted))]"
            title="Copy error details"
          >
            <Clipboard className="h-4 w-4" />
            {copied ? "Copied!" : "Copy details"}
          </button>
        </div>

        {/* Diagnostics (collapsible) */}
        <details className="mt-6 rounded-xl border border-[hsl(var(--border))]">
          <summary className="cursor-pointer select-none rounded-xl px-3 py-2 text-sm font-medium hover:bg-[hsl(var(--muted))]">
            Technical details
          </summary>
          <div className="border-t border-[hsl(var(--border))] p-3">
            {error?.digest && (
              <div className="mb-3 text-xs opacity-70">
                <span className="font-semibold">Digest:</span> {error.digest}
              </div>
            )}
            <pre className="max-h-72 overflow-auto rounded-lg bg-black/80 p-3 text-xs text-white">
              {details}
            </pre>
          </div>
        </details>
      </div>
    </div>
  );
}
