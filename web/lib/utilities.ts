import { AnyNodeData } from "@/components/Flow/types";
import { Node } from "reactflow";

export const inferEntryFromNodes = (
  nodes: Node<AnyNodeData>[],
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

export function toPlainDecimal(value: number): string {
  if (!isFinite(value)) return String(value);

  const str = value.toString();

  // If not scientific notation, return as-is
  if (!str.includes("e")) {
    return str;
  }

  const [base, exponent] = str.split("e");
  const exp = Number(exponent);

  const [integerPart, decimalPart = ""] = base.split(".");
  const digits = integerPart + decimalPart;

  if (exp > 0) {
    return digits + "0".repeat(exp - decimalPart.length);
  }

  return "0." + "0".repeat(Math.abs(exp) - 1) + digits.replace("-", "");
}
