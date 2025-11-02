import LeftNav from "@/components/nav/LeftNav";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Toaster } from "sonner";
import "../globals.css";

export const metadata: Metadata = {
  title: "Job 5 Dashboard",
  description: "Flow Builder, Pro IDE, Clinic, MCP",
};

const Job5Layout = ({ children }: { children: React.ReactNode }) => {
  if (process.env.NEXT_PUBLIC_JOB5_ENABLED !== "true") redirect("/");
  return (
    <html lang="en" data-theme="dark">
      <body className="flex min-h-screen bg-[hsl(var(--bg))] text-[hsl(var(--fg))]">
        <LeftNav />
        <main className="flex-1 p-4">{children}</main>
        <Toaster />
      </body>
    </html>
  );
};

export default Job5Layout;
