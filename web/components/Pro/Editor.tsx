// components/Pro/Editor.tsx
"use client";

import { useProStore } from "@/hooks/useProStore";
import Editor, { OnChange } from "@monaco-editor/react";
import { Check, Loader2 } from "lucide-react";
import { useCallback, useEffect } from "react";

const ProEditor = () => {
  const {
    selectedPath,
    content,
    dirty,
    loadingFile,
    saving,
    setContent,
    saveCurrentFile,
  } = useProStore();

  const handleChange: OnChange = useCallback(
    (value) => {
      setContent(value ?? "");
    },
    [setContent]
  );

  // Cmd/Ctrl + S
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      if (!isCmdOrCtrl || e.key.toLowerCase() !== "s") return;
      e.preventDefault();
      void saveCurrentFile();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [saveCurrentFile]);

  const showPlaceholder = !selectedPath;

  return (
    <div className="relative flex h-full flex-col">
      {/* header */}
      <div className="flex items-center justify-between border-b border-[hsl(var(--border))] bg-background/70 px-3 py-1 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-muted-foreground">
            {selectedPath ?? "No file selected"}
          </span>
          {dirty && (
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-500">
              unsaved
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => saveCurrentFile()}
          disabled={!selectedPath || saving || !dirty}
          className={`inline-flex items-center gap-1 rounded-full border border-[hsl(var(--border))] px-3 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-accent-foreground ${
            !selectedPath || (!dirty && !saving)
              ? "cursor-not-allowed opacity-60 hover:bg-transparent hover:text-muted-foreground"
              : ""
          }
          `}
        >
          {saving ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <Check className="h-3 w-3" />
              Save
            </>
          )}
        </button>
      </div>

      {loadingFile && (
        <div className="pointer-events-none absolute inset-x-0 top-7 z-10 flex items-center justify-center text-xs text-muted-foreground">
          Loading file…
        </div>
      )}

      {/* editor */}
      <div className="flex-1">
        {showPlaceholder ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            Select a file from the workspace to start editing.
          </div>
        ) : (
          <Editor
            height="100%"
            defaultLanguage="typescript"
            theme="vs-dark"
            path={selectedPath ?? undefined}
            value={content}
            onChange={handleChange}
            options={{
              fontSize: 13,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2,
            }}
          />
        )}
      </div>
    </div>
  );
};

export default ProEditor;
