// components/Pro/FileTree.tsx
"use client";

import { useProStore } from "@/hooks/useProStore";
import { FileCode2, Folder } from "lucide-react";
import { useEffect } from "react";

function getName(path: string) {
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}

const FileTree = () => {
  const { files, selectedPath, loadingFiles, loadFiles, openFile } =
    useProStore();

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  return (
    <div className="flex h-full flex-col bg-background/40 text-xs">
      <div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-3 py-2">
        <span className="font-medium text-muted-foreground">Workspace</span>
        <button
          type="button"
          onClick={() => loadFiles()}
          className="rounded-full px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          Refresh
        </button>
      </div>

      {loadingFiles && files.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          Loading workspace…
        </div>
      ) : (
        <div className="flex-1 overflow-auto px-2 py-1">
          {files.length !== 0 && (
            <div className="px-1 py-1 text-muted-foreground/70">
              No files found under workspace root.
            </div>
          )}

          <div className="space-y-0.5">
            {files.map((item) => {
              const isSelected = item.path === selectedPath;

              if (item.type === "dir") {
                return (
                  <div
                    key={item.path}
                    className="flex items-center gap-1 rounded px-1 py-0.5 text-muted-foreground"
                  >
                    <Folder className="h-3 w-3" />
                    <span className="truncate">{item.path}</span>
                  </div>
                );
              }

              return (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => openFile(item.path)}
                  className={`flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-muted-foreground hover:bg-accent hover:text-accent-foreground ${
                    isSelected
                      ? "bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground"
                      : ""
                  }
                  `}
                >
                  <FileCode2 className="h-3 w-3 shrink-0" />
                  <span className="truncate">{getName(item.path)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default FileTree;
