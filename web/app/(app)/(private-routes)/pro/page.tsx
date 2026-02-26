import ProPage from "@/components/Pro/ProPage";
import { Suspense } from "react";

export default function Pro() {
  return (
    <Suspense fallback={<></>}>
      <ProPage />
    </Suspense>
  );
}
