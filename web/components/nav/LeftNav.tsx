/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import {
  Activity,
  Code2,
  LayoutDashboard,
  Settings,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "../ThemeToggle";

const item =
  "flex items-center gap-2 rounded-xl px-3 py-2 hover:bg-[hsl(var(--muted))]";
const active = "bg-[hsl(var(--muted))] ring-1 ring-[hsl(var(--border))]";

function NavItem({
  href,
  label,
  Icon,
}: {
  href: string;
  label: string;
  Icon: any;
}) {
  const pathname = usePathname();
  const isActive = pathname?.startsWith(href);
  return (
    <Link href={href} className={`${item} ${isActive ? active : ""}`}>
      <Icon className="h-4 w-4" />
      <span className="text-sm">{label}</span>
    </Link>
  );
}

export default function LeftNav() {
  return (
    <aside className="relative w-64 border-r border-[hsl(var(--border))] p-3 space-y-2 bg-[hsl(var(--panel))]">
      <div className="px-2 pb-2 text-xs uppercase tracking-wide opacity-70">
        Job 5
      </div>
      <NavItem href="/" label="Dashboard" Icon={LayoutDashboard} />
      <NavItem href="/flow" label="Flow" Icon={Workflow} />
      <NavItem href="/pro" label="Pro" Icon={Code2} />
      <NavItem href="/clinic" label="Clinic" Icon={Activity} />
      <NavItem href="/mcp" label="MCP" Icon={Settings} />

      <div className="absolute bottom-4 left-3">
        <ThemeToggle />
      </div>
    </aside>
  );
}
