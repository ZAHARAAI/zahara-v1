interface EmptyStateProps {
  /** Lucide icon element or any ReactNode */
  icon?: React.ReactNode;
  title: string;
  description?: string;
  /** Button / CTA slot — caller controls what goes here */
  action?: React.ReactNode;
  /**
   * sm  → compact, for narrow panels (e.g. 288px agents list)
   * md  → default, for main content areas
   * lg  → full-page empty states
   */
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  size = "md",
  className = "",
}: EmptyStateProps) {
  const wrapperPad = {
    sm: "px-4 py-8",
    md: "px-6 py-12",
    lg: "px-8 py-16",
  }[size];

  const iconSize = {
    sm: "h-8 w-8",
    md: "h-10 w-10",
    lg: "h-12 w-12",
  }[size];

  const titleSize = {
    sm: "text-[13px]",
    md: "text-[14px]",
    lg: "text-base",
  }[size];

  const descSize = {
    sm: "text-[11px]",
    md: "text-[12px]",
    lg: "text-sm",
  }[size];

  return (
    <div
      className={[
        "flex flex-col items-center justify-center text-center",
        wrapperPad,
        className,
      ].join(" ")}
    >
      {icon && (
        <div
          className={[
            iconSize,
            "mb-3 rounded-xl bg-muted flex items-center justify-center text-muted_fg",
          ].join(" ")}
        >
          {icon}
        </div>
      )}

      <p className={[titleSize, "font-medium text-fg"].join(" ")}>{title}</p>

      {description && (
        <p
          className={[
            descSize,
            "mt-1 text-muted_fg leading-relaxed max-w-[220px]",
          ].join(" ")}
        >
          {description}
        </p>
      )}

      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
