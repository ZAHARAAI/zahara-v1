"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/", label: "Vibe" },
  { href: "/flow", label: "Flow" },
  { href: "/pro", label: "Pro" },
  { href: "/clinic", label: "Clinic" },
];

function isActive(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/" || pathname === "";
  }
  return pathname.startsWith(href);
}

export default function TopTabs() {
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-2 border-b border-[hsl(var(--border))] px-4 pt-4">
      {tabs.map((tab) => {
        const active = isActive(pathname, tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={[
              "inline-flex items-center rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors",
              active
                ? "bg-[hsl(var(--accent))] text-[hsl(var(--accent-fg))]"
                : "text-[hsl(var(--muted-fg))] hover:bg-[hsl(var(--muted))]",
            ].join(" ")}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
