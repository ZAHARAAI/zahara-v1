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
    "inline-flex items-center justify-center rounded-xl text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 disabled:cursor-not-allowed";

  const variants: Record<Variant, string> = {
    primary:
      "bg-accent text-accent_fg hover:text-accent hover:bg-accent_soft",
    secondary: "bg-muted text-fg hover:bg-muted_2",
    ghost: "bg-transparent text-fg hover:bg-muted/60",
    outline: "border border-border bg-transparent text-fg hover:bg-muted/40",
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
