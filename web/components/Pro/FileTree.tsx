/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { listFiles, readFile } from "@/services/api";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useProStore } from "./store";

type Item = {
  path: string;
  type: "file" | "dir";
  size?: number;
  modified?: string;
};

export default function FileTree() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const { setActiveFile } = useProStore();

  const load = async () => {
    setLoading(true);
    try {
      const res = await listFiles();
      setItems(res.files);
    } catch (e: any) {
      toast.error("Failed to list files", { description: e.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const open = async (path: string) => {
    try {
      const f = await readFile(path);
      setActiveFile(f.path, f.content, f.sha);
    } catch (e: any) {
      toast.error("Failed to open file", { description: e.message });
    }
  };

  if (loading) return <div className="p-3 text-sm">Loading files…</div>;

  return (
    <div className="h-full overflow-auto text-sm">
      <ul className="divide-y divide-[hsl(var(--border))]">
        {items.map((it) => (
          <li
            key={it.path}
            className="p-2 flex items-center justify-between hover:bg-[hsl(var(--muted))] cursor-pointer"
            onClick={() => it.type === "file" && open(it.path)}
          >
            <span className="truncate">{it.path}</span>
            <span className="text-xs opacity-60">{it.type}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
