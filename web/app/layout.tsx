import LeftNav from "@/components/nav/LeftNav";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Toaster } from "sonner";
import "./globals.css";
import Providers from "./providers";

export const metadata: Metadata = {
  title: "Job 5 Dashboard",
  description: "Flow Builder, Pro IDE, Clinic, MCP",
};

const Job5Layout = ({ children }: { children: React.ReactNode }) => {
  if (process.env.JOB5_ENABLED !== "true") redirect("/");

  return (
    <html lang="en" data-theme="dark">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
          (function(){
            try{
              var t = localStorage.getItem('theme');
              if(!t){
                t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
              }
              document.documentElement.dataset.theme = t;
            }catch(e){}
          })();`,
          }}
        />
      </head>

      <body className="flex min-h-screen bg-[hsl(var(--bg))] text-[hsl(var(--fg))] min-w-[1300px]">
        <LeftNav />
        <main className="flex-1 p-4">
          <Providers>{children}</Providers>
        </main>
        <Toaster />
      </body>
    </html>
  );
};

export default Job5Layout;
