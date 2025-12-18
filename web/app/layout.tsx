import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import Providers from "./providers";

const geistSans = Geist({
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Job 6 Dashboard",
  description: "Vibe, Flow Builder, Pro IDE, Clinic",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" className={geistSans.className}>
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
          })();
        `,
          }}
        />
      </head>
      <body className="min-h-screen bg-[hsl(var(--bg))] text-[hsl(var(--fg))] min-w-[1200px]">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
