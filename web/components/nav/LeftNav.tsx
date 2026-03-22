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
  LogOut,
  UserPlus,
  LogIn,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import ThemeToggle from "../ThemeToggle";
import { useIsGuest } from "@/hooks/useIsGuest";

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
  const isActive = pathname?.startsWith(matchPrefix ?? href);

  return (
    <Link href={href} className={`${itemCls} ${isActive ? activeCls : ""}`}>
      <Icon className="h-4 w-4 shrink-0" />
      <span className="text-sm">{label}</span>
    </Link>
  );
}

// ── Guest banner ──────────────────────────────────────────────────────────────
function GuestBanner() {
  return (
    <div className="mx-1 mb-2 rounded-xl border border-amber-500/25 bg-amber-500/8 p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <Sparkles className="h-3.5 w-3.5 text-amber-500 shrink-0" />
        <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
          Demo mode
        </span>
      </div>
      <p className="text-[10px] text-amber-700/70 dark:text-amber-300/60 leading-relaxed mb-2.5">
        You&apos;re exploring with shared demo data. Sign up for your own
        agents, runs, and keys.
      </p>
      <div className="flex flex-col gap-1.5">
        <Link
          href="/register"
          className="flex items-center justify-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-amber-600 transition-colors"
        >
          <UserPlus className="h-3 w-3" />
          Sign up — it&apos;s free
        </Link>
        <Link
          href="/login"
          className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[11px] text-muted_fg hover:bg-muted hover:text-fg transition-colors"
        >
          <LogIn className="h-3 w-3" />
          Log in
        </Link>
      </div>
    </div>
  );
}

// ── Logout button for real (non-guest) users ──────────────────────────────────
function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      // After logout, redirect to root — proxy middleware will auto-provision
      // a fresh guest token so the demo loop still works
      router.push("/");
      router.refresh();
    } catch {
      toast.error("Failed to log out");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleLogout}
      disabled={loading}
      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted_fg hover:bg-muted hover:text-fg transition-colors duration-150 disabled:opacity-50"
    >
      <LogOut className="h-4 w-4 shrink-0" />
      {loading ? "Logging out…" : "Log out"}
    </button>
  );
}

// ── Main nav ──────────────────────────────────────────────────────────────────
export default function LeftNav() {
  const isGuest = useIsGuest();

  return (
    <aside className="relative flex w-56 flex-col border-r border-border bg-panel shrink-0">
      {/* ── Brand ── */}
      <div className="px-5 pb-3 pt-4 text-xs uppercase tracking-widest opacity-50 select-none">
        Zahara AI
      </div>

      {/* ── Nav items ── */}
      <nav className="flex-1 space-y-1 px-3">
        <NavItem href="/overview" label="Overview" Icon={LayoutDashboard} />
        <NavItem
          href="/builders"
          label="Builders"
          Icon={Layers}
          matchPrefix="/builders"
        />
        <NavItem href="/agents" label="Agents" Icon={Users} />
        <NavItem href="/clinic" label="Clinic" Icon={Activity} />
        <NavItem href="/audit" label="Audit" Icon={ClipboardList} />
        <NavItem href="/mcp" label="MCP" Icon={Settings} />
        <NavItem href="/providers" label="Provider Keys" Icon={Key} />
      </nav>

      {/* ── Bottom section: guest banner OR logout ── */}
      <div className="mt-auto px-0 pt-2 pb-3">
        {isGuest ? (
          <GuestBanner />
        ) : (
          <div className="px-3 mb-2">
            <LogoutButton />
          </div>
        )}

        {/* Theme toggle always visible */}
        <div className="px-3">
          <ThemeToggle />
        </div>
      </div>
    </aside>
  );
}
