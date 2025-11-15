import { Activity, Code2, Settings, Workflow } from "lucide-react";
import Link from "next/link";

const cards = [
  {
    href: "/flow",
    label: "Flow Builder",
    description:
      "Design agent graphs with Start, Model, Tool, and Output nodes. Configure prompts and routing visually.",
    Icon: Workflow,
  },
  {
    href: "/pro",
    label: "Pro IDE",
    description:
      "Edit agent code in a Monaco-powered editor, then run flows with live logs and AG-UI event streaming.",
    Icon: Code2,
  },
  {
    href: "/clinic",
    label: "Clinic",
    description:
      "Inspect runtime sessions with a live event timeline, tokens, cost, and replay controls.",
    Icon: Activity,
  },
  {
    href: "/mcp",
    label: "MCP Connectors",
    description:
      "Manage CSV Analyst, Web Fetch, and Retrieval QA connectors with enable/disable and Test actions.",
    Icon: Settings,
  },
] as const;

export default async function Job5Index() {
  return (
    <div className="h-[calc(100vh-2rem)] flex flex-col gap-6 p-4">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.16em] text-[hsl(var(--muted-fg))]">
          Job 5 • Flowise + VoltAgent + MCP + AG-UI
        </p>
        <h1 className="text-2xl font-semibold">Unified Agent Dashboard</h1>
        <p className="text-sm max-w-2xl text-[hsl(var(--muted-fg))]">
          Build flows, refine code, watch runs in real time, and control MCP
          connectors — all in one cohesive interface. Use the shortcuts below or
          the left navigation to jump into a surface.
        </p>
      </header>

      <section className="grid grid-cols-4 gap-4">
        {cards.map(({ href, label, description, Icon }) => (
          <Link
            key={href}
            href={href}
            className="group flex flex-col justify-between rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--panel))] p-4 text-sm hover:border-[hsl(var(--accent))] hover:shadow-sm transition-colors"
          >
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--muted))] px-3 py-1 text-[11px] font-medium text-[hsl(var(--muted-fg))]">
                <Icon className="h-3 w-3" />
                <span>{label}</span>
              </div>
              <p className="text-[13px] leading-relaxed text-[hsl(var(--muted-fg))]">
                {description}
              </p>
            </div>
            <div className="mt-4 text-[12px] font-medium text-[hsl(var(--accent))] group-hover:underline">
              Open {label.split(" ")[0]}
            </div>
          </Link>
        ))}
      </section>
    </div>
  );
}
