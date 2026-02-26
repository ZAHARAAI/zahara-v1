import Timeline from "@/components/Clinic/Timeline";
import { Suspense } from "react";

export default function ClinicPage() {
  return (
    <div className="h-[calc(100vh-2rem)] rounded-2xl overflow-hidden">
      <Suspense fallback={<></>}>
        <Timeline />
      </Suspense>
    </div>
  );
}
