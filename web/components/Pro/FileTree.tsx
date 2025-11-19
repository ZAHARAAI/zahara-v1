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
  const [loading, setLoading] = useState(false);
  const { setActiveFile } = useProStore();

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const list = await listFiles();
        setItems(list);
      } catch (e: any) {
        toast.error("Failed to load files", { description: e.message });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const open = async (path: string) => {
    try {
      const file = await readFile(path);
      setActiveFile(file.path, file.content, file.sha);
    } catch (e: any) {
      toast.error("Failed to open file", { description: e.message });
    }
  };

  return (
    <div className="h-full overflow-auto bg-[hsl(var(--panel))]">
      <div className="border-b border-[hsl(var(--border))] px-3 py-2 text-xs font-medium">
        Files
      </div>
      {loading && <div className="p-3 text-xs opacity-70">Loading files…</div>}
      <ul className="text-xs">
        {items.map((it) => (
          <li
            key={it.path}
            className="flex cursor-pointer items-center justify-between px-3 py-2 hover:bg-[hsl(var(--muted))]"
            onClick={() => it.type === "file" && open(it.path)}
          >
            <span className="truncate">{it.path}</span>
            <span className="text-[10px] uppercase opacity-60">{it.type}</span>
          </li>
        ))}
        {!loading && items.length === 0 && (
          <li className="px-3 py-2 text-xs opacity-60">No files found.</li>
        )}
      </ul>
    </div>
  );
}
