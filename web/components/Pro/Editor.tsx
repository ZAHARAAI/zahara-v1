/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { Button } from "@/components/ui/Button";
import { writeFile } from "@/services/api";
import Editor from "@monaco-editor/react";
import { toast } from "sonner";
import { useProStore } from "./store";

export default function ProEditor() {
  const { activePath, content, sha, setContent, dirty, markSaved } =
    useProStore();

  const save = async () => {
    if (!activePath) return toast.warning("Open a file first");
    if (!sha) return toast.warning("Missing SHA — re-open the file");
    try {
      const res = await writeFile(activePath, content, sha);
      markSaved(res.sha);
      toast.success("Saved", { description: `${activePath}` });
    } catch (e: any) {
      toast.error("Save failed", { description: e.message });
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 p-2 border-b border-[hsl(var(--border))]">
        <Button variant="secondary" onClick={save}>
          {dirty ? "Save *" : "Save"}
        </Button>
        <div className="text-xs opacity-70">
          {activePath || "No file open"} {sha ? `(${sha.slice(0, 7)}…)` : ""}
        </div>
      </div>
      <Editor
        height="100%"
        defaultLanguage="typescript"
        value={content}
        onChange={(v) => setContent(v || "")}
        options={{ minimap: { enabled: false }, fontSize: 14 }}
      />
    </div>
  );
}
