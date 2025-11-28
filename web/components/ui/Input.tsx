"use client";

import React from "react";

export function Input({
  label,
  className = "",
  ...props
}: { label?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block text-xs">
      {label && <div className="mb-1 ms-1 opacity-70">{label}</div>}
      <input
        className={`w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--bg))] px-3 py-1.5 text-xs outline-none focus:border-[hsl(var(--accent))] ${className}`}
        {...props}
      />
    </label>
  );
}
