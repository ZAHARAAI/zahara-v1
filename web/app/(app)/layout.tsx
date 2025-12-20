import LeftNav from "@/components/nav/LeftNav";
// import TopTabs from "@/components/nav/TopTabs";
import RunOverlay from "@/components/RunOverlay";
import { getAccessToken } from "@/lib/auth-cookies";
import { redirect } from "next/navigation";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const token = await getAccessToken();
  if (!token) redirect("/login");

  return (
    <div className="flex min-h-screen bg-[hsl(var(--bg))] text-[hsl(var(--fg))]">
      <LeftNav />
      <div className="flex-1 flex flex-col">
        {/* <TopTabs /> */}
        <div className="flex-1 p-4">{children}</div>
      </div>
      <RunOverlay />
    </div>
  );
}
