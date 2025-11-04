"use client";
import React from "react";

export function Textarea({
  label,
  className = "",
  ...props
}: { label?: string } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className="block">
      {label && <div className="text-xs mb-1 opacity-70">{label}</div>}
      <textarea
        className={`w-full rounded-xl border border-[hsl(var(--border))] bg-transparent px-3 py-2 text-sm h-40 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] ${className}`}
        {...props}
      />
    </label>
  );
}
