import { Home, SearchX } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex h-screen flex-col items-center justify-center bg-linear-to-br from-zinc-900 via-zinc-800 to-zinc-900 text-white">
      <div className="flex flex-col items-center justify-center p-8 rounded-2xl bg-zinc-800/60 shadow-xl border border-white/10">
        <SearchX className="h-16 w-16 text-red-400 mb-4 animate-pulse" />
        <h2 className="text-3xl font-semibold mb-2">Page Not Found</h2>
        <p className="text-zinc-400 mb-6 text-center max-w-sm">
          Sorry, we couldn’t find the page you’re looking for. It may have been
          moved, renamed, or deleted.
        </p>
        <Link
          href="/"
          className="flex items-center gap-2 rounded-xl bg-linear-to-r from-green-500 to-emerald-600 px-5 py-2.5 text-white font-medium hover:opacity-90 transition"
        >
          <Home className="h-4 w-4" />
          Return Home
        </Link>
      </div>

      <p className="mt-6 text-sm text-zinc-500">Error 404 • Zahara Dashboard</p>
    </div>
  );
}
