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
      toast.error("Save failed", {
        description: e.message,
      });
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-[hsl(var(--border))] px-3 py-2 text-xs">
        <div className="truncate">
          {activePath || <span className="opacity-60">No file selected</span>}
        </div>
        {dirty && (
          <span className="rounded-full bg-[hsl(var(--accent))]/10 px-2 py-0.5 text-[10px] text-[hsl(var(--accent))]">
            unsaved
          </span>
        )}
        <Button
          className="ml-auto"
          variant="secondary"
          onClick={save}
          disabled={!dirty}
        >
          Save
        </Button>
      </div>
      <div className="flex-1">
        <Editor
          height="100%"
          defaultLanguage="typescript"
          theme="vs-dark"
          value={content}
          onChange={(v) => setContent(v ?? "")}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
          }}
        />
      </div>
    </div>
  );
}
