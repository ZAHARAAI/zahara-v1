"use client";

import { Toaster } from "sonner";
export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex-1 p-4">
      {children}
      <Toaster richColors position="top-right" />
    </main>
  );
}
