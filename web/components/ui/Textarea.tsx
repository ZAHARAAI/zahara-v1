"use client";

import React from "react";

export function Textarea({
  label,
  className = "",
  ...props
}: { label?: string } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className="block text-xs">
      {label && <div className="mb-1 opacity-70">{label}</div>}
      <textarea
        className={`w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--bg))] px-3 py-1.5 text-xs outline-none focus:border-[hsl(var(--accent))] ${className}`}
        {...props}
      />
    </label>
  );
}
