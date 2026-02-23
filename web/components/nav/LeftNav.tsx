/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import {
  Activity,
  Code2,
  Key,
  LayoutDashboard,
  Settings,
  Users,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "../ThemeToggle";

const item = "flex items-center gap-2 rounded-xl px-3 py-2 hover:bg-muted";
const active = "bg-muted ring-1 ring-border";

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
    <aside className="relative w-56 border-r border-border p-3 space-y-2 bg-panel">
      <div className="px-2 pb-2 text-xs uppercase tracking-wide opacity-70">
        ZAHARA AI
      </div>
      <NavItem href="/overview" label="Overview" Icon={LayoutDashboard} />
      <NavItem href="/agents" label="Agents" Icon={Users} />
      <NavItem href="/flow" label="Flow" Icon={Workflow} />
      <NavItem href="/vibe" label="Vibe" Icon={LayoutDashboard} />
      <NavItem href="/pro" label="Pro" Icon={Code2} />
      <NavItem href="/clinic" label="Clinic" Icon={Activity} />
      <NavItem href="/mcp" label="MCP" Icon={Settings} />
      <NavItem href="/providers" label="Provider Keys" Icon={Key} />

      <div className="absolute bottom-4 left-3">
        <ThemeToggle />
      </div>
    </aside>
  );
}
