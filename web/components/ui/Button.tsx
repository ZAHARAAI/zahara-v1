"use client";
import React from "react";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
};

export function Button({
  className = "",
  variant = "primary",
  ...props
}: Props) {
  const base =
    "px-3 py-2 cursor-pointer rounded-xl text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]";
  const styles =
    variant === "primary"
      ? "bg-[hsl(var(--accent))] text-[hsl(var(--accent-fg))] hover:opacity-90"
      : variant === "secondary"
      ? "bg-[hsl(var(--muted))] hover:opacity-90"
      : "hover:bg-[hsl(var(--muted))]";
  return <button className={`${base} ${styles} ${className}`} {...props} />;
}
