import FlowPage from "@/components/Flow/Flow";
import { Suspense } from "react";

export default function Flow() {
  return (
    <Suspense fallback={<></>}>
      <FlowPage />
    </Suspense>
  );
}
