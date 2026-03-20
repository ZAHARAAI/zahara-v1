import LeftNav from "@/components/nav/LeftNav";
import RunOverlay from "@/components/RunOverlay";
import { getAccessToken } from "@/lib/auth-cookies";
import { redirect } from "next/navigation";

export default async function PrivateRoutesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Enforce authentication — unauthenticated users go to /login
  const token = await getAccessToken();
  if (!token) redirect("/login");

  return (
    <div className="flex h-dvh bg-bg text-fg min-w-[1200px]">
      <LeftNav />
      <div className="flex-1 flex flex-col">
        <div
          className="flex-1 p-4 overflow-auto"
          style={{
            scrollbarWidth: "thin",
            scrollbarColor: "hsl(var(--border)) transparent",
          }}
        >
          {children}
        </div>
      </div>
      <RunOverlay />
    </div>
  );
}
