// web/components/nav/LeftNav.tsx
"use client";
import {
  Activity,
  ClipboardList,
  Key,
  LayoutDashboard,
  Layers,
  Users,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "../ThemeToggle";

const itemCls =
  "flex items-center gap-2 rounded-xl px-3 py-2 hover:bg-muted transition-colors duration-150";
const activeCls = "bg-muted ring-1 ring-border";

function NavItem({
  href,
  label,
  Icon,
  matchPrefix,
}: {
  href: string;
  label: string;
  Icon: React.ElementType;
  matchPrefix?: string;
}) {
  const pathname = usePathname();
  // matchPrefix allows /builders to match even when URL has ?v=... query
  const isActive = pathname?.startsWith(matchPrefix ?? href);

  return (
    <Link href={href} className={`${itemCls} ${isActive ? activeCls : ""}`}>
      <Icon className="h-4 w-4 shrink-0" />
      <span className="text-sm">{label}</span>
    </Link>
  );
}

export default function LeftNav() {
  return (
    <aside className="relative w-56 border-r border-border p-3 space-y-1 bg-panel shrink-0">
      <div className="px-2 pb-3 pt-1 text-xs uppercase tracking-widest opacity-50 select-none">
        Zahara AI
      </div>

      <NavItem href="/overview" label="Overview" Icon={LayoutDashboard} />

      <NavItem
        href="/builders"
        label="Builders"
        Icon={Layers}
        matchPrefix="/builders" // active on /builders regardless of ?v= param
      />

      <NavItem href="/agents" label="Agents" Icon={Users} />
      <NavItem href="/clinic" label="Clinic" Icon={Activity} />
      <NavItem href="/audit" label="Audit" Icon={ClipboardList} />
      <NavItem href="/mcp" label="MCP" Icon={Settings} />
      <NavItem href="/providers" label="Provider Keys" Icon={Key} />

      <div className="absolute bottom-4 left-3">
        <ThemeToggle />
      </div>
    </aside>
  );
}
