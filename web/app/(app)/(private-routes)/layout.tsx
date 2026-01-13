import LeftNav from "@/components/nav/LeftNav";
import RunOverlay from "@/components/RunOverlay";
import { getAccessToken } from "@/lib/auth-cookies";
import { redirect } from "next/navigation";

export default async function PrivateRoutesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const token = await getAccessToken();
  if (!token) redirect("/login");
  return (
    <div className="flex min-h-screen bg-bg text-fg">
      <LeftNav />
      <div className="flex-1 flex flex-col">
        <div className="flex-1 p-4">{children}</div>
      </div>
      <RunOverlay />
    </div>
  );
}
