"use client";

import React from "react";

type Variant = "primary" | "secondary" | "ghost" | "outline";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: "sm" | "xs";
};

export function Button({
  className = "",
  variant = "primary",
  size = "sm",
  ...props
}: Props) {
  const base =
    "inline-flex items-center justify-center rounded-xl text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:opacity-60 disabled:cursor-not-allowed";

  const variants: Record<Variant, string> = {
    primary:
      "bg-[hsl(var(--accent))] text-[hsl(var(--accent-fg))] hover:bg-[hsl(var(--accent-soft))]",
    secondary:
      "bg-[hsl(var(--muted))] text-[hsl(var(--fg))] hover:bg-[hsl(var(--muted-2))]",
    ghost:
      "bg-transparent text-[hsl(var(--fg))] hover:bg-[hsl(var(--muted))]/60",
    outline:
      "border border-[hsl(var(--border))] bg-transparent text-[hsl(var(--fg))] hover:bg-[hsl(var(--muted))]/40",
  };

  const sizes: Record<"sm" | "xs", string> = {
    sm: "px-3 py-2",
    xs: "px-2 py-1 text-xs",
  };

  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    />
  );
}
