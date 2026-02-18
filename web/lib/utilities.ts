import { AnyNodeData } from "@/components/Flow/types";
import { Node } from "reactflow";

export const inferEntryFromNodes = (
  nodes: Node<AnyNodeData>[]
): string | undefined => {
  for (const n of nodes) {
    // Only treat Tool nodes as potential entry nodes
    if (
      "toolName" in n.data &&
      typeof n.data.entry === "string" &&
      n.data.entry.trim()
    )
      return n.data.entry.trim();
  }
  return undefined;
};

export const protectedRoutes = [
  "/",
  "/clinic",
  "/flow",
  "/mcp",
  "/pro",
  "/providers",
];
export const avoidRoutes = ["/login", "/register"];
